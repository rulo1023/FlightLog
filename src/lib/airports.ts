import type { Flight } from './flights';

type AirportTuple = [
  icao: string,
  name: string,
  city: string,
  country: string,
  countryCode: string,
  timeZone: string,
  latitude: number,
  longitude: number,
];

export type Airport = {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  countryCode: string;
  timeZone: string;
  latitude: number;
  longitude: number;
};

const rawAirports = require('../data/airports.json') as Record<string, AirportTuple>;
const byIcao = new Map<string, string>();

Object.entries(rawAirports).forEach(([iata, value]) => {
  if (value[0]) byIcao.set(value[0].toUpperCase(), iata);
});

export function getAirport(code?: string | null): Airport | null {
  const normalized = (code ?? '').trim().toUpperCase();
  const iata = rawAirports[normalized] ? normalized : byIcao.get(normalized);
  if (!iata) return null;
  const value = rawAirports[iata];
  return {
    iata,
    icao: value[0],
    name: value[1],
    city: value[2],
    country: value[3],
    countryCode: value[4],
    timeZone: value[5],
    latitude: value[6],
    longitude: value[7],
  };
}

export function countryFlag(countryCode?: string | null) {
  const code = (countryCode ?? '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '🌍';
  return String.fromCodePoint(...[...code].map((character) => character.charCodeAt(0) + 127397));
}

export function airportPlace(airport: Airport | null, fallback?: string | null) {
  if (!airport) return fallback || 'Aeropuerto sin identificar';
  return airport.city || airport.name;
}

export function formatInTimeZone(date: Date, timeZone?: string | null, withDate = false) {
  try {
    return new Intl.DateTimeFormat('es-ES', {
      timeZone: timeZone || undefined,
      day: withDate ? 'numeric' : undefined,
      month: withDate ? 'short' : undefined,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  }
}

function partsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second),
  };
}

export function localDateTimeParts(
  value?: string | null,
  timeZone?: string | null,
) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  if (timeZone) {
    try {
      const parts = partsInZone(date, timeZone);
      return {
        date: `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
        time: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`,
      };
    } catch {
      // Continue with the offset included in the original value.
    }
  }

  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)/,
  );

  return match
    ? { date: match[1], time: `${match[2]}:${match[3]}` }
    : null;
}

export function zonedLocalDate(dateKey: string, time: string, timeZone?: string | null) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  if (!timeZone) return new Date(year, month - 1, day, hour, minute);

  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = new Date(target);
  try {
    for (let iteration = 0; iteration < 2; iteration += 1) {
      const parts = partsInZone(guess, timeZone);
      const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
      guess = new Date(target - (represented - guess.getTime()));
    }
    return guess;
  } catch {
    return new Date(year, month - 1, day, hour, minute);
  }
}

export function flightDepartureDate(flight: Flight) {
  if (flight.scheduled_departure_at) {
    const scheduled = new Date(flight.scheduled_departure_at);
    if (Number.isFinite(scheduled.getTime())) return scheduled;
  }
  const airport = getAirport(flight.departure_airport_code);
  return zonedLocalDate(
    flight.flight_date,
    flight.departure_time_local?.slice(0, 5) || '12:00',
    airport?.timeZone,
  );
}

export function routeDistanceKm(from: Airport | null, to: Airport | null) {
  if (!from || !to) return null;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(to.latitude - from.latitude);
  const dLon = radians(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function calculatedArrival(
  departureDate: string,
  departureTime: string,
  durationMinutes: string | number,
  departureCode: string,
  arrivalCode: string,
) {
  const from = getAirport(departureCode);
  const to = getAirport(arrivalCode);
  const duration = Number(durationMinutes);
  const timeMatch = departureTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!timeMatch || !Number.isInteger(duration) || duration < 0) return null;

  const [year, month, day] = departureDate.split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return null;

  if (from?.timeZone && to?.timeZone) {
    const departure = zonedLocalDate(
      departureDate,
      departureTime,
      from.timeZone,
    );

    if (departure) {
      try {
        const parts = partsInZone(
          new Date(departure.getTime() + duration * 60_000),
          to.timeZone,
        );

        return {
          date: `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
          time: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`,
          timeZone: to.timeZone,
          usesAirportTimeZones: true,
        };
      } catch {
        // Fall back to a direct local-time sum below.
      }
    }
  }

  const arrival = new Date(Date.UTC(year, month - 1, day, Number(timeMatch[1]), Number(timeMatch[2])) + duration * 60_000);
  return {
    date: `${arrival.getUTCFullYear()}-${String(arrival.getUTCMonth() + 1).padStart(2, '0')}-${String(arrival.getUTCDate()).padStart(2, '0')}`,
    time: `${String(arrival.getUTCHours()).padStart(2, '0')}:${String(arrival.getUTCMinutes()).padStart(2, '0')}`,
    timeZone: null,
    usesAirportTimeZones: false,
  };
}
