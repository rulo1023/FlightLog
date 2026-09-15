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

    /*
     * Aircraft model and registration are intentionally omitted for now.
     * Flightera loads those through its protected page_data endpoint.
     */
    aircraftModel: undefined,
    registration: undefined,
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

    try {
      const suggestions =
        await lookupFlightera(flightNumber, flightDate);

      return Response.json(
        { suggestions },
        { headers: cors },
      );
    } catch (error) {
      console.error('Flightera lookup error:', error);

      const message =
        error instanceof Error
          ? error.message
          : 'Error al buscar el vuelo';

      return Response.json(
        { error: message },
        { status: 502, headers: cors },
      );
    }
  }),
);
