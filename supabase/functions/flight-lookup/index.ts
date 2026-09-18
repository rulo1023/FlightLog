import { withSupabase } from 'npm:@supabase/server';

type JsonObject = Record<string, unknown>;

type FlighteraFlight = {
  '@type'?: string;
  flightNumber?: string;
  departureTime?: string;
  arrivalTime?: string;
  flightDistance?: string;
  url?: string;
  departureAirport?: {
    '@type'?: string;
    iataCode?: string;
    name?: string;
  };
  arrivalAirport?: {
    '@type'?: string;
    iataCode?: string;
    name?: string;
  };
  provider?: {
    '@type'?: string;
    iataCode?: string;
    icaoCode?: string;
    name?: string;
  };
  aircraft?: string | {
    name?: string;
    model?: string;
    identifier?: string;
  };
};

type AirLabsRoute = {
  airline_iata?: string;
  flight_iata?: string;
  flight_number?: string;
  dep_iata?: string;
  arr_iata?: string;
  dep_time?: string;
  arr_time?: string;
  duration?: number;
  days?: unknown;
  aircraft_icao?: string;
};

const FLIGHTERA_BASE = 'https://www.flightera.net';

const browserHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/152.0.0.0 Safari/537.36',
  'Accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const asText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const airlineNames: Record<string, string> = {
  V7: 'Volotea',
  IB: 'Iberia',
  I2: 'Iberia Express',
  UX: 'Air Europa',
  VY: 'Vueling',
  FR: 'Ryanair',
  U2: 'easyJet',
  W6: 'Wizz Air',
};

const aircraftNames: Record<string, string> = {
  A319: 'Airbus A319',
  A320: 'Airbus A320',
  A20N: 'Airbus A320neo',
  A321: 'Airbus A321',
  A21N: 'Airbus A321neo',
  A332: 'Airbus A330-200',
  A333: 'Airbus A330-300',
  A338: 'Airbus A330-800neo',
  A339: 'Airbus A330-900neo',
  A359: 'Airbus A350-900',
  A35K: 'Airbus A350-1000',
  B737: 'Boeing 737',
  B738: 'Boeing 737-800',
  B739: 'Boeing 737-900',
  B38M: 'Boeing 737 MAX 8',
  B39M: 'Boeing 737 MAX 9',
  B744: 'Boeing 747-400',
  B748: 'Boeing 747-8',
  B752: 'Boeing 757-200',
  B763: 'Boeing 767-300',
  B772: 'Boeing 777-200',
  B77W: 'Boeing 777-300ER',
  B788: 'Boeing 787-8',
  B789: 'Boeing 787-9',
  B78X: 'Boeing 787-10',
  E190: 'Embraer E190',
  E195: 'Embraer E195',
  E290: 'Embraer E190-E2',
  E295: 'Embraer E195-E2',
  AT72: 'ATR 72',
  AT76: 'ATR 72-600',
  CRJ9: 'Bombardier CRJ900',
};

function aircraftName(value: unknown): string | undefined {
  const code = asText(value).toUpperCase();
  return code ? aircraftNames[code] ?? code : undefined;
}

function dateWeekdayTokens(value: string): string[] {
  const weekday = new Date(`${value}T12:00:00Z`).getUTCDay();
  const short = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][weekday];
  const long = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][weekday];
  return [String(weekday), String(weekday === 0 ? 7 : weekday), short, long];
}

function routeRunsOnDate(days: unknown, flightDate: string): boolean {
  if (days == null || days === '') return true;

  const values = Array.isArray(days)
    ? days.map((item) => asText(item).toLowerCase())
    : asText(days).toLowerCase().split(/[\s,;|/]+/);

  if (!values.length) return true;

  const tokens = dateWeekdayTokens(flightDate);
  return values.some((value) => tokens.includes(value));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: browserHeaders,
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Flightera HTTP ${response.status}`);
    }

    const html = await response.text();

    if (!html || html.length < 100) {
      throw new Error('Flightera devolvió una respuesta vacía');
    }

    return html;
  } finally {
    clearTimeout(timer);
  }
}

function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];

  const regex =
    /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(regex)) {
    try {
      blocks.push(JSON.parse(match[1]));
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }

  return blocks;
}

function findFlightInJsonLd(value: unknown): FlighteraFlight | null {
  if (!value || typeof value !== 'object') return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFlightInJsonLd(item);
      if (found) return found;
    }

    return null;
  }

  const object = value as JsonObject;

  if (object['@type'] === 'Flight') {
    return object as FlighteraFlight;
  }

  const graph = object['@graph'];

  if (Array.isArray(graph)) {
    for (const item of graph) {
      const found = findFlightInJsonLd(item);
      if (found) return found;
    }
  }

  return null;
}

function extractFlight(html: string): FlighteraFlight | null {
  for (const block of extractJsonLdBlocks(html)) {
    const flight = findFlightInJsonLd(block);
    if (flight) return flight;
  }

  return null;
}

function isoDate(value: unknown): string {
  const text = asText(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})T/);
  return match?.[1] ?? '';
}

function localTime(value: unknown): string | undefined {
  const text = asText(value);
  const match = text.match(/T([01]\d|2[0-3]):([0-5]\d)/);

  return match ? `${match[1]}:${match[2]}` : undefined;
}

function durationMinutes(
  departureTime: unknown,
  arrivalTime: unknown,
): number | undefined {
  const departure = Date.parse(asText(departureTime));
  const arrival = Date.parse(asText(arrivalTime));

  if (!Number.isFinite(departure) || !Number.isFinite(arrival)) {
    return undefined;
  }

  const minutes = Math.round((arrival - departure) / 60000);

  return minutes >= 0 ? minutes : undefined;
}

function distanceKm(value: unknown): number | undefined {
  const text = asText(value);
  const match = text.match(/([\d,.]+)\s*km/i);

  if (!match) return undefined;

  const number = Number(match[1].replace(',', '.'));

  return Number.isFinite(number) ? Math.round(number) : undefined;
}

function aircraftFromFlightera(
  flight: FlighteraFlight,
  html: string,
): { aircraftModel?: string; registration?: string } {
  const aircraft = flight.aircraft;
  const schemaModel = typeof aircraft === 'string'
    ? aircraft.trim()
    : aircraft?.model?.trim() || aircraft?.name?.trim();
  const schemaRegistration = typeof aircraft === 'object'
    ? aircraft.identifier?.trim().toUpperCase()
    : undefined;
  const normalizedHtml = html
    .replace(/&quot;/gi, '"')
    .replace(/\\u002D/gi, '-');
  const registrationMatch = normalizedHtml.match(
    /"(?:aircraftRegistration|aircraft_registration|registration)"\s*:\s*"([A-Z0-9]{1,3}-[A-Z0-9]{3,6})"/i,
  ) ?? normalizedHtml.match(
    /(?:AIRCRAFT\s+)?REGISTRATION[\s\S]{0,800}?([A-Z0-9]{1,3}-[A-Z0-9]{3,6})/i,
  );
  const modelMatch = normalizedHtml.match(
    /"(?:aircraftModel|aircraft_model|aircraftType|aircraft_type)"\s*:\s*"([^"<>]{2,60})"/i,
  );

  return {
    aircraftModel: schemaModel || modelMatch?.[1]?.trim() || undefined,
    registration:
      schemaRegistration && /^[A-Z0-9]{1,3}-[A-Z0-9]{3,6}$/.test(schemaRegistration)
        ? schemaRegistration
        : registrationMatch?.[1]?.toUpperCase(),
  };
}

async function lookupAirLabsRoutes(
  flightNumber: string,
  flightDate: string,
) {
  const apiKey = Deno.env.get('AIRLABS_API_KEY');

  if (!apiKey) {
    console.warn('AIRLABS_API_KEY is not configured');
    return [];
  }

  const params = new URLSearchParams({
    api_key: apiKey,
    flight_iata: flightNumber,
    _fields:
      'airline_iata,flight_iata,flight_number,dep_iata,arr_iata,' +
      'dep_time,arr_time,duration,days,aircraft_icao',
  });
  const response = await fetch(`https://airlabs.co/api/v9/routes?${params}`, {
    headers: { Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => null) as
    | { response?: AirLabsRoute[]; error?: { message?: string } }
    | null;

  if (!response.ok || payload?.error) {
    throw new Error(
      payload?.error?.message || `AirLabs HTTP ${response.status}`,
    );
  }

  const routes = Array.isArray(payload?.response) ? payload.response : [];
  const matchingDay = routes.filter((route) =>
    routeRunsOnDate(route.days, flightDate)
  );
  const candidates = matchingDay.length ? matchingDay : routes;
  const seen = new Set<string>();

  return candidates.flatMap((route) => {
    const departureCode = asText(route.dep_iata).toUpperCase();
    const arrivalCode = asText(route.arr_iata).toUpperCase();
    const airlineCode = asText(route.airline_iata).toUpperCase();
    const resolvedNumber = asText(route.flight_iata)
      .replace(/\s+/g, '')
      .toUpperCase() || `${airlineCode}${asText(route.flight_number)}`;

    if (
      resolvedNumber !== flightNumber ||
      !/^[A-Z]{3}$/.test(departureCode) ||
      !/^[A-Z]{3}$/.test(arrivalCode)
    ) {
      return [];
    }

    const departureTime = asText(route.dep_time) || undefined;
    const arrivalTime = asText(route.arr_time) || undefined;
    const key = `${departureCode}-${arrivalCode}-${departureTime ?? ''}`;

    if (seen.has(key)) return [];
    seen.add(key);

    return [{
      kind: 'route',
      source: 'airlabs',
      flightNumber,
      flightDate,
      departureCode,
      arrivalCode,
      airlineCode: airlineCode || undefined,
      airlineName: airlineNames[airlineCode],
      departureTime,
      arrivalTime,
      durationMinutes:
        typeof route.duration === 'number' && Number.isFinite(route.duration)
          ? Math.round(route.duration)
          : undefined,
      aircraftModel: aircraftName(route.aircraft_icao),
      registration: undefined,
    }];
  }).slice(0, 8);
}

async function lookupFlightera(
  flightNumber: string,
  flightDate: string,
) {
  /*
   * Step 1:
   * Resolve the generic flight page.
   *
   * Example:
   *   /en/flight/VY2616
   *
   * Flightera redirects this to its canonical current route and exposes
   * the departure IATA code in schema.org JSON-LD.
   */
  const genericUrl =
    `${FLIGHTERA_BASE}/en/flight/${encodeURIComponent(flightNumber)}`;

  const genericHtml = await fetchHtml(genericUrl);
  const genericFlight = extractFlight(genericHtml);

  if (!genericFlight) {
    return [];
  }

  const originIata =
    asText(genericFlight.departureAirport?.iataCode).toUpperCase();

  if (!/^[A-Z]{3}$/.test(originIata)) {
    return [];
  }

  /*
   * Step 2:
   * Request the historical flight using the generic slug and IATA origin.
   *
   * Flightera accepts:
   *
   * /flight_details/VY2616/VY2616/AGP/2026-09-14
   *
   * and redirects it to:
   *
   * /flight_details/Vueling-Malaga-Bilbao/VY2616/LEMG/2026-09-14
   */
  const detailUrl =
    `${FLIGHTERA_BASE}/en/flight_details/` +
    `${encodeURIComponent(flightNumber)}/` +
    `${encodeURIComponent(flightNumber)}/` +
    `${encodeURIComponent(originIata)}/` +
    `${encodeURIComponent(flightDate)}`;

  let detailHtml: string;

  try {
    detailHtml = await fetchHtml(detailUrl);
  } catch (error) {
    if (
      error instanceof Error &&
      /Flightera HTTP 404/.test(error.message)
    ) {
      return [];
    }

    throw error;
  }

  const flight = extractFlight(detailHtml);

  if (!flight) {
    return [];
  }

  const resolvedNumber =
    asText(flight.flightNumber).replace(/\s+/g, '').toUpperCase();

  if (resolvedNumber !== flightNumber) {
    return [];
  }

  /*
   * Verify that Flightera actually resolved the requested historical date.
   * This prevents returning the current operation if a historical URL does
   * not correspond to a real flight.
   */
  if (isoDate(flight.departureTime) !== flightDate) {
    return [];
  }

  const departureCode =
    asText(flight.departureAirport?.iataCode).toUpperCase();

  const arrivalCode =
    asText(flight.arrivalAirport?.iataCode).toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(departureCode) ||
    !/^[A-Z]{3}$/.test(arrivalCode)
  ) {
    return [];
  }

  const scheduledDepartureAt = asText(flight.departureTime);
  const scheduledArrivalAt = asText(flight.arrivalTime);
  const aircraft = aircraftFromFlightera(flight, detailHtml);

  const suggestion = {
    kind: 'dated',
    flightNumber,
    flightDate,

    departureCode,
    arrivalCode,

    airlineCode:
      asText(flight.provider?.iataCode).toUpperCase() || undefined,

    departureTime:
      localTime(scheduledDepartureAt),

    arrivalTime:
      localTime(scheduledArrivalAt),

    arrivalDate:
      isoDate(scheduledArrivalAt) || undefined,

    durationMinutes:
      durationMinutes(
        scheduledDepartureAt,
        scheduledArrivalAt,
      ),

    distanceKm:
      distanceKm(flight.flightDistance),

    scheduledDepartureAt:
      scheduledDepartureAt || undefined,

    scheduledArrivalAt:
      scheduledArrivalAt || undefined,

    sourceUrl:
      asText(flight.url) || detailUrl,

    source: 'flightera',

    aircraftModel: aircraft.aircraftModel,
    registration: aircraft.registration,
  };

  return [suggestion];
}

Deno.serve(
  withSupabase({ auth: 'user' }, async (request) => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    if (request.method !== 'POST') {
      return Response.json(
        { error: 'Método no permitido' },
        { status: 405, headers: cors },
      );
    }

    const input = await request.json().catch(() => ({}));

    const flightNumber = asText(input.flightNumber)
      .replace(/\s+/g, '')
      .toUpperCase();

    const flightDate = asText(input.flightDate);

    if (
      !/^[A-Z0-9]{2,3}\d{1,6}[A-Z]?$/.test(flightNumber) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(flightDate)
    ) {
      return Response.json(
        { error: 'Número o fecha inválidos' },
        { status: 400, headers: cors },
      );
    }

    let suggestions: unknown[] = [];
    const today = new Date().toISOString().slice(0, 10);

    if (flightDate > today) {
      try {
        suggestions = await lookupAirLabsRoutes(flightNumber, flightDate);
      } catch (error) {
        console.error('AirLabs route lookup error:', error);
      }
    }

    if (!suggestions.length) {
      try {
        suggestions = await lookupFlightera(flightNumber, flightDate);
      } catch (error) {
        console.warn('Flightera lookup unavailable:', error);
      }
    }

    if (!suggestions.length && flightDate <= today) {
      try {
        suggestions = await lookupAirLabsRoutes(flightNumber, flightDate);
      } catch (error) {
        console.error('AirLabs route lookup error:', error);
      }
    }

    return Response.json(
      { suggestions },
      { headers: cors },
    );
  }),
);
