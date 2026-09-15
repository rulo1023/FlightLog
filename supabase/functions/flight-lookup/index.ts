import { withSupabase } from 'npm:@supabase/server';

type AirLabsRow = Record<string, unknown>;

const asText = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const asMinutes = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
const datePart = (value: unknown): string => asText(value).slice(0, 10);
const timePart = (value: unknown): string => {
  const text = asText(value);
  const match = text.match(/(?:^|\s)([01]\d|2[0-3]):([0-5]\d)(?:$|:)/);
  return match ? `${match[1]}:${match[2]}` : '';
};

async function queryAirLabs(endpoint: 'flight' | 'routes', flightNumber: string, key: string): Promise<AirLabsRow[]> {
  const url = new URL(`https://airlabs.co/api/v9/${endpoint}`);
  url.searchParams.set('flight_iata', flightNumber);
  url.searchParams.set('api_key', key);
  if (endpoint === 'routes') url.searchParams.set('limit', '20');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`AirLabs HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.error) {
      if (asText(payload.error.code) === 'not_found') return [];
      throw new Error(asText(payload.error.message) || asText(payload.error.code) || 'AirLabs error');
    }
    const rows = payload?.response;
    return Array.isArray(rows) ? rows : rows && typeof rows === 'object' ? [rows] : [];
  } finally {
    clearTimeout(timer);
  }
}

function suggestion(row: AirLabsRow, flightNumber: string, flightDate: string, kind: 'dated' | 'route') {
  const departureCode = asText(row.dep_iata).toUpperCase();
  const arrivalCode = asText(row.arr_iata).toUpperCase();
  if (!/^[A-Z]{3}$/.test(departureCode) || !/^[A-Z]{3}$/.test(arrivalCode)) return null;
  const departureTime = timePart(row.dep_time);
  const arrivalTime = timePart(row.arr_time);
  const aircraftModel = asText(row.model) || asText(row.aircraft_icao);
  const registration = kind === 'dated' ? asText(row.reg_number).toUpperCase() : '';
  return {
    kind, flightNumber, flightDate, departureCode, arrivalCode,
    airlineCode: asText(row.airline_iata).toUpperCase() || undefined,
    departureTime: departureTime || undefined,
    arrivalTime: arrivalTime || undefined,
    arrivalDate: kind === 'dated' ? datePart(row.arr_time) || undefined : undefined,
    durationMinutes: asMinutes(row.duration),
    aircraftModel: aircraftModel || undefined,
    registration: registration || undefined,
  };
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(withSupabase({ auth: 'user' }, async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return Response.json({ error: 'Método no permitido' }, { status: 405, headers: cors });
  const input = await request.json().catch(() => ({}));
  const flightNumber = asText(input.flightNumber).replace(/\s+/g, '').toUpperCase();
  const flightDate = asText(input.flightDate);
  if (!/^[A-Z0-9]{2,3}\d{1,6}[A-Z]?$/.test(flightNumber) || !/^\d{4}-\d{2}-\d{2}$/.test(flightDate)) {
    return Response.json({ error: 'Número o fecha inválidos' }, { status: 400, headers: cors });
  }
  const key = Deno.env.get('AIRLABS_API_KEY');
  if (!key) return Response.json({ error: 'La búsqueda aún no está configurada' }, { status: 503, headers: cors });

  try {
    const today = new Date();
    const requested = new Date(`${flightDate}T12:00:00Z`);
    const nearToday = Math.abs(today.getTime() - requested.getTime()) < 3 * 86400000;
    if (nearToday) {
      const current = await queryAirLabs('flight', flightNumber, key);
      const dated = current
        .filter((row) => asText(row.flight_iata).toUpperCase() === flightNumber && datePart(row.dep_time) === flightDate)
        .map((row) => suggestion(row, flightNumber, flightDate, 'dated'))
        .filter(Boolean);
      if (dated.length) return Response.json({ suggestions: dated.slice(0, 3) }, { headers: cors });
    }
    const routes = await queryAirLabs('routes', flightNumber, key);
    const day = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][requested.getUTCDay()];
    const sameNumber = routes.filter((row) => asText(row.flight_iata).toUpperCase() === flightNumber);
    const matches = sameNumber.filter((row) => {
      const code = asText(row.flight_iata).toUpperCase();
      const days = row.days;
      return code === flightNumber && (!Array.isArray(days) || days.length === 0 || days.includes(day));
    });
    const suggestions = (matches.length ? matches : sameNumber).map((row) => suggestion(row, flightNumber, flightDate, 'route')).filter(Boolean);
    return Response.json({ suggestions: suggestions.slice(0, 5) }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Error al buscar el vuelo' }, { status: 502, headers: cors });
  }
}));
