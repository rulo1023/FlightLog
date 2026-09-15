import { FlightDraft, localDateKey } from './flights';

export type LookupSuggestion = {
  kind: 'dated' | 'route';
  flightNumber: string;
  flightDate: string;
  departureCode: string;
  arrivalCode: string;
  departureTime?: string;
  arrivalTime?: string;
  arrivalDate?: string;
  durationMinutes?: number;
  aircraftModel?: string;
  registration?: string;
  airlineCode?: string;
  distanceKm?: number;
};

type FlighteraFlight = {
  '@type'?: string;
  flightNumber?: string;
  departureTime?: string;
  arrivalTime?: string;
  flightDistance?: string;
  url?: string;
  departureAirport?: {
    iataCode?: string;
    name?: string;
  };
  arrivalAirport?: {
    iataCode?: string;
    name?: string;
  };
  provider?: {
    iataCode?: string;
    icaoCode?: string;
    name?: string;
  };
};

const FLIGHTERA_BASE = 'https://www.flightera.net';

export function normalizedFlightNumber(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

export function canLookup(value: string): boolean {
  return /^[A-Z0-9]{2,3}\d{1,6}[A-Z]?$/.test(
    normalizedFlightNumber(value),
  );
}

const cache = new Map<
  string,
  {
    expiresAt: number;
    result: Promise<LookupSuggestion[]>;
  }
>();

async function fetchHtml(url: string): Promise<string> {
  console.log('FLIGHTERA REQUEST:', url);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  console.log(
    'FLIGHTERA RESPONSE:',
    response.status,
    url,
  );

  if (response.status === 404) {
    throw new Error('FLIGHT_NOT_FOUND');
  }

  if (!response.ok) {
    throw new Error(
      `Flightera HTTP ${response.status}`,
    );
  }

  const html = await response.text();

  if (!html || html.length < 100) {
    throw new Error(
      'Flightera devolvió una respuesta vacía',
    );
  }

  return html;
}

function extractFlight(
  html: string,
): FlighteraFlight | null {
  const regex =
    /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  const matches = html.matchAll(regex);

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1]);

      const found = findFlightInJsonLd(parsed);

      if (found) {
        return found;
      }
    } catch {
      // Ignorar JSON-LD inválido.
    }
  }

  return null;
}

function findFlightInJsonLd(
  value: unknown,
): FlighteraFlight | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFlightInJsonLd(item);

      if (found) {
        return found;
      }
    }

    return null;
  }

  const object = value as Record<string, unknown>;

  if (object['@type'] === 'Flight') {
    return object as FlighteraFlight;
  }

  if (Array.isArray(object['@graph'])) {
    for (const item of object['@graph']) {
      const found = findFlightInJsonLd(item);

      if (found) {
        return found;
      }
    }
  }

  return null;
}

function datePart(value?: string): string {
  if (!value) {
    return '';
  }

  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})T/,
  );

  return match?.[1] ?? '';
}

function timePart(value?: string): string {
  if (!value) {
    return '';
  }

  const match = value.match(
    /T([01]\d|2[0-3]):([0-5]\d)/,
  );

  return match
    ? `${match[1]}:${match[2]}`
    : '';
}

function calculateDurationMinutes(
  departure?: string,
  arrival?: string,
): number | undefined {
  if (!departure || !arrival) {
    return undefined;
  }

  const departureMs = Date.parse(departure);
  const arrivalMs = Date.parse(arrival);

  if (
    !Number.isFinite(departureMs) ||
    !Number.isFinite(arrivalMs)
  ) {
    return undefined;
  }

  const minutes = Math.round(
    (arrivalMs - departureMs) / 60000,
  );

  return minutes >= 0
    ? minutes
    : undefined;
}

function parseDistanceKm(
  value?: string,
): number | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(
    /([\d,.]+)\s*km/i,
  );

  if (!match) {
    return undefined;
  }

  const number = Number(
    match[1].replace(',', '.'),
  );

  return Number.isFinite(number)
    ? Math.round(number)
    : undefined;
}

export async function lookupFlight(
  flightNumber: string,
  date: Date,
): Promise<LookupSuggestion[]> {
  const number =
    normalizedFlightNumber(flightNumber);

  const day =
    localDateKey(date);

  const cacheKey =
    `${number}:${day}`;

  const previous =
    cache.get(cacheKey);

  if (
    previous &&
    previous.expiresAt > Date.now()
  ) {
    return previous.result;
  }

  const result =
    requestFlighteraLookup(
      number,
      day,
    );

  cache.set(
    cacheKey,
    {
      expiresAt:
        Date.now() + 5 * 60000,
      result,
    },
  );

  try {
    return await result;
  } catch (error) {
    cache.delete(cacheKey);
    throw error;
  }
}

async function requestFlighteraLookup(
  flightNumber: string,
  flightDate: string,
): Promise<LookupSuggestion[]> {
  try {
    /*
     * Paso 1:
     * obtener el vuelo genérico y extraer
     * el aeropuerto de origen actual.
     */

    const genericUrl =
      `${FLIGHTERA_BASE}/en/flight/` +
      encodeURIComponent(flightNumber);

    const genericHtml =
      await fetchHtml(genericUrl);

    const genericFlight =
      extractFlight(genericHtml);

    if (!genericFlight) {
      console.log(
        'NO GENERIC FLIGHT JSON-LD',
      );

      return [];
    }

    const originIata =
      genericFlight
        .departureAirport
        ?.iataCode
        ?.trim()
        .toUpperCase();

    if (
      !originIata ||
      !/^[A-Z]{3}$/.test(originIata)
    ) {
      console.log(
        'NO VALID ORIGIN IATA',
        originIata,
      );

      return [];
    }

    console.log(
      'FLIGHTERA ORIGIN:',
      originIata,
    );

    /*
     * Paso 2:
     * pedir el vuelo histórico.
     */

    const detailUrl =
      `${FLIGHTERA_BASE}` +
      `/en/flight_details/` +
      `${encodeURIComponent(flightNumber)}/` +
      `${encodeURIComponent(flightNumber)}/` +
      `${encodeURIComponent(originIata)}/` +
      `${encodeURIComponent(flightDate)}`;

    const detailHtml =
      await fetchHtml(detailUrl);

    const flight =
      extractFlight(detailHtml);

    if (!flight) {
      console.log(
        'NO HISTORICAL FLIGHT JSON-LD',
      );

      return [];
    }

    const resolvedNumber =
      flight.flightNumber
        ?.replace(/\s+/g, '')
        .toUpperCase();

    if (
      resolvedNumber !==
      flightNumber
    ) {
      console.log(
        'FLIGHT NUMBER MISMATCH:',
        resolvedNumber,
      );

      return [];
    }

    if (
      datePart(
        flight.departureTime,
      ) !== flightDate
    ) {
      console.log(
        'FLIGHT DATE MISMATCH:',
        flight.departureTime,
      );

      return [];
    }

    const departureCode =
      flight
        .departureAirport
        ?.iataCode
        ?.trim()
        .toUpperCase();

    const arrivalCode =
      flight
        .arrivalAirport
        ?.iataCode
        ?.trim()
        .toUpperCase();

    if (
      !departureCode ||
      !arrivalCode
    ) {
      return [];
    }

    const suggestion: LookupSuggestion = {
      kind: 'dated',

      flightNumber,
      flightDate,

      departureCode,
      arrivalCode,

      airlineCode:
        flight.provider
          ?.iataCode
          ?.trim()
          .toUpperCase(),

      departureTime:
        timePart(
          flight.departureTime,
        ) || undefined,

      arrivalTime:
        timePart(
          flight.arrivalTime,
        ) || undefined,

      arrivalDate:
        datePart(
          flight.arrivalTime,
        ) || undefined,

      durationMinutes:
        calculateDurationMinutes(
          flight.departureTime,
          flight.arrivalTime,
        ),

      distanceKm:
        parseDistanceKm(
          flight.flightDistance,
        ),

      aircraftModel:
        undefined,

      registration:
        undefined,
    };

    console.log(
      'FLIGHTERA RESULT:',
      JSON.stringify(
        suggestion,
        null,
        2,
      ),
    );

    return [suggestion];
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        'FLIGHT_NOT_FOUND'
    ) {
      return [];
    }

    console.error(
      'DIRECT FLIGHTERA LOOKUP ERROR:',
      error,
    );

    throw error;
  }
}

export function applySuggestion(
  draft: FlightDraft,
  suggestion: LookupSuggestion,
): FlightDraft {
  if (
    normalizedFlightNumber(
      draft.flightNumber,
    ) !==
      suggestion.flightNumber ||
    localDateKey(
      draft.flightDate,
    ) !==
      suggestion.flightDate
  ) {
    return draft;
  }

  const source =
    `Flightera:${suggestion.kind}`;

  const fieldSources = {
    ...draft.fieldSources,
  };

  for (
    const field of [
      'departureCode',
      'arrivalCode',
    ]
  ) {
    fieldSources[field] =
      source;
  }

  if (suggestion.departureTime) {
    fieldSources.departureTime =
      source;
  }

  if (suggestion.arrivalTime) {
    fieldSources.arrivalTime =
      source;
  }

  if (suggestion.arrivalDate) {
    fieldSources.arrivalDate =
      source;
  }

  if (
    suggestion.durationMinutes != null
  ) {
    fieldSources.durationMinutes =
      source;
  }

  if (suggestion.aircraftModel) {
    fieldSources.aircraftModel =
      source;
  }

  if (
    suggestion.kind === 'dated' &&
    suggestion.registration
  ) {
    fieldSources.registration =
      source;
  }

  return {
    ...draft,

    fieldSources,

    airlineName:
      draft.airlineName ||
      suggestion.airlineCode ||
      '',

    departureCode:
      suggestion.departureCode,

    arrivalCode:
      suggestion.arrivalCode,

    departureTime:
      suggestion.departureTime ||
      draft.departureTime,

    arrivalTime:
      suggestion.arrivalTime ||
      draft.arrivalTime,

    arrivalDate:
      suggestion.arrivalDate ||
      draft.arrivalDate,

    durationMinutes:
      suggestion.durationMinutes != null
        ? String(
            suggestion.durationMinutes,
          )
        : draft.durationMinutes,

    aircraftModel:
      suggestion.aircraftModel ||
      draft.aircraftModel,

    registration:
      suggestion.kind === 'dated'
        ? suggestion.registration ||
          draft.registration
        : draft.registration,
  };
}
