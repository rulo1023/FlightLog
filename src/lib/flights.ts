import { getAirport, localDateTimeParts } from './airports';

export type FlightStatus = 'flown' | 'planned';

export type Flight = {
  id: string;
  user_id: string;
  flight_number: string | null;
  flight_date: string;
  status: FlightStatus;
  airline_name: string | null;
  departure_airport_code: string | null;
  departure_airport_name: string | null;
  arrival_airport_code: string | null;
  arrival_airport_name: string | null;
  departure_time_local: string | null;
  arrival_date: string | null;
  arrival_time_local: string | null;
  duration_minutes: number | null;
  distance_km: number | null;
  scheduled_departure_at: string | null;
  actual_departure_at: string | null;
  scheduled_arrival_at: string | null;
  actual_arrival_at: string | null;
  departure_time_zone: string | null;
  arrival_time_zone: string | null;
  aircraft_model: string | null;
  aircraft_registration: string | null;
  seat: string | null;
  cabin_class: string | null;
  notes: string | null;
  field_sources: Record<string, string>;
  created_at: string;
  updated_at: string;
};

export type FlightDraft = {
  flightNumber: string;
  flightDate: Date;
  status: FlightStatus;
  airlineName: string;
  departureCode: string;
  departureName: string;
  arrivalCode: string;
  arrivalName: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  durationMinutes: string;
  distanceKm: string;
  scheduledDepartureAt: string;
  actualDepartureAt: string;
  scheduledArrivalAt: string;
  actualArrivalAt: string;
  aircraftModel: string;
  registration: string;
  seat: string;
  cabinClass: string;
  notes: string;
  fieldSources: Record<string, string>;
};

export const actualScheduleSource = 'Horario real';

export const todayLocal = () => new Date();

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function dateLabel(key: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(parseDateKey(key));
}

export function shortDateLabel(key: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(parseDateKey(key));
}

export function flightNumberLabel(value?: string | null): string {
  return value?.trim() || 'Sin número';
}

export function formatDuration(minutes: number | null): string | null {
  if (minutes == null) return null;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return hours ? `${hours} h ${String(remaining).padStart(2, '0')} min` : `${remaining} min`;
}

export function blankDraft(): FlightDraft {
  const date = todayLocal();
  return {
    flightNumber: '', flightDate: date,
    status: 'planned', airlineName: '', departureCode: '', departureName: '',
    arrivalCode: '', arrivalName: '', departureTime: '', arrivalDate: '',
    arrivalTime: '', durationMinutes: '', distanceKm: '',
    scheduledDepartureAt: '', actualDepartureAt: '',
    scheduledArrivalAt: '', actualArrivalAt: '',
    aircraftModel: '', registration: '',
    seat: '', cabinClass: '', notes: '', fieldSources: {},
  };
}

export function flightToDraft(flight: Flight): FlightDraft {
  return {
    flightNumber: flight.flight_number ?? '',
    flightDate: parseDateKey(flight.flight_date),
    status: flight.status,
    airlineName: flight.airline_name ?? '',
    departureCode: flight.departure_airport_code ?? '',
    departureName: flight.departure_airport_name ?? '',
    arrivalCode: flight.arrival_airport_code ?? '',
    arrivalName: flight.arrival_airport_name ?? '',
    departureTime: flight.departure_time_local?.slice(0, 5) ?? '',
    arrivalDate: flight.arrival_date ?? '',
    arrivalTime: flight.arrival_time_local?.slice(0, 5) ?? '',
    durationMinutes: flight.duration_minutes?.toString() ?? '',
    distanceKm: flight.distance_km?.toString() ?? '',
    scheduledDepartureAt: flight.scheduled_departure_at ?? '',
    actualDepartureAt: flight.actual_departure_at ?? '',
    scheduledArrivalAt: flight.scheduled_arrival_at ?? '',
    actualArrivalAt: flight.actual_arrival_at ?? '',
    aircraftModel: flight.aircraft_model ?? '',
    registration: flight.aircraft_registration ?? '',
    seat: flight.seat ?? '',
    cabinClass: flight.cabin_class ?? '',
    notes: flight.notes ?? '',
    fieldSources: flight.field_sources ?? {},
  };
}

const optional = (value: string) => value.trim() || null;
const optionalUpper = (value: string) => value.trim().toUpperCase() || null;
const timeIsValid = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function validateDraft(draft: FlightDraft): string | null {
  const number = draft.flightNumber.replace(/\s+/g, '').toUpperCase();
  if (number && !/^[A-Z0-9]{2,12}$/.test(number)) {
    return 'Escribe un número de vuelo válido, por ejemplo IB3170.';
  }
  if (draft.departureCode && !/^[A-Z]{3,4}$/.test(draft.departureCode.trim().toUpperCase())) {
    return 'El aeropuerto de salida debe tener 3 o 4 letras.';
  }
  if (draft.arrivalCode && !/^[A-Z]{3,4}$/.test(draft.arrivalCode.trim().toUpperCase())) {
    return 'El aeropuerto de llegada debe tener 3 o 4 letras.';
  }
  if (draft.departureTime && !timeIsValid(draft.departureTime)) {
    return 'La hora de salida debe tener el formato HH:mm.';
  }
  if (draft.arrivalTime && !timeIsValid(draft.arrivalTime)) {
    return 'La hora de llegada debe tener el formato HH:mm.';
  }
  if (draft.arrivalDate && !/^\d{4}-\d{2}-\d{2}$/.test(draft.arrivalDate)) {
    return 'La fecha de llegada debe tener el formato AAAA-MM-DD.';
  }
  if (draft.arrivalDate) {
    const parsed = parseDateKey(draft.arrivalDate);
    if (localDateKey(parsed) !== draft.arrivalDate || draft.arrivalDate < localDateKey(draft.flightDate)) {
      return 'La fecha de llegada debe ser válida y no anterior a la salida.';
    }
  }
  if (draft.durationMinutes && (!/^\d+$/.test(draft.durationMinutes) || Number(draft.durationMinutes) > 10080)) {
    return 'La duración debe ser un número de minutos entre 0 y 10080.';
  }
  return null;
}

export function applyActualScheduleToDraft(
  draft: FlightDraft,
): FlightDraft {
  const departureAirport = getAirport(draft.departureCode);
  const arrivalAirport = getAirport(draft.arrivalCode);
  const actualDeparture = localDateTimeParts(
    draft.actualDepartureAt,
    departureAirport?.timeZone,
  );
  const actualArrival = localDateTimeParts(
    draft.actualArrivalAt,
    arrivalAirport?.timeZone,
  );

  if (!actualDeparture && !actualArrival) return draft;

  const fieldSources = { ...draft.fieldSources };
  let durationMinutes = draft.durationMinutes;

  if (actualDeparture) fieldSources.departureTime = actualScheduleSource;
  if (actualArrival) {
    fieldSources.arrivalTime = actualScheduleSource;
    fieldSources.arrivalDate = actualScheduleSource;
  }

  if (draft.actualDepartureAt && draft.actualArrivalAt) {
    const departureMs = Date.parse(draft.actualDepartureAt);
    const arrivalMs = Date.parse(draft.actualArrivalAt);
    const duration = Math.round((arrivalMs - departureMs) / 60_000);

    if (Number.isFinite(duration) && duration >= 0) {
      durationMinutes = String(duration);
      fieldSources.durationMinutes = actualScheduleSource;
    }
  }

  return {
    ...draft,
    departureTime: actualDeparture?.time ?? draft.departureTime,
    arrivalTime: actualArrival?.time ?? draft.arrivalTime,
    arrivalDate: actualArrival?.date ?? draft.arrivalDate,
    durationMinutes,
    fieldSources,
  };
}

export function draftToRow(draft: FlightDraft, userId: string) {
  const departureAirport = getAirport(draft.departureCode);
  const arrivalAirport = getAirport(draft.arrivalCode);
  return {
    user_id: userId,
    flight_number: optionalUpper(draft.flightNumber),
    flight_date: localDateKey(draft.flightDate),
    status: draft.status,
    airline_name: optional(draft.airlineName),
    departure_airport_code: optionalUpper(draft.departureCode),
    departure_airport_name: optional(draft.departureName) ?? departureAirport?.name ?? null,
    arrival_airport_code: optionalUpper(draft.arrivalCode),
    arrival_airport_name: optional(draft.arrivalName) ?? arrivalAirport?.name ?? null,
    departure_time_local: optional(draft.departureTime),
    arrival_date: optional(draft.arrivalDate),
    arrival_time_local: optional(draft.arrivalTime),
    duration_minutes: draft.durationMinutes ? Number(draft.durationMinutes) : null,
    distance_km: draft.distanceKm ? Number(draft.distanceKm) : null,
    departure_time_zone: departureAirport?.timeZone || null,
    arrival_time_zone: arrivalAirport?.timeZone || null,
    scheduled_departure_at: optional(draft.scheduledDepartureAt),
    actual_departure_at: optional(draft.actualDepartureAt),
    scheduled_arrival_at: optional(draft.scheduledArrivalAt),
    actual_arrival_at: optional(draft.actualArrivalAt),
    aircraft_model: optional(draft.aircraftModel),
    aircraft_registration: optionalUpper(draft.registration),
    seat: optionalUpper(draft.seat),
    cabin_class: optional(draft.cabinClass),
    notes: optional(draft.notes),
    field_sources: draft.fieldSources,
  };
}
