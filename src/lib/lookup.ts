import { FlightDraft, localDateKey } from './flights';
import { supabase } from './supabase';
import { getAirport, routeDistanceKm } from './airports';

export type LookupSuggestion = {
  kind: 'dated' | 'route';
  source?: 'flightera' | 'airlabs';

  flightNumber: string;
  flightDate: string;

  departureCode: string;
  departureName?: string;

  arrivalCode: string;
  arrivalName?: string;

  departureTime?: string;
  arrivalTime?: string;
  arrivalDate?: string;

  durationMinutes?: number;

  aircraftModel?: string;
  registration?: string;

  airlineCode?: string;
  airlineName?: string;

  distanceKm?: number;

  scheduledDepartureAt?: string;
  scheduledArrivalAt?: string;
};

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

  aircraft?:
    | string
    | {
        name?: string;
        model?: string;
        identifier?: string;
      };
};

const FLIGHTERA_BASE = 'https://www.flightera.net';

export function normalizedFlightNumber(
  value: string,
): string {
  return value
    .replace(/\s+/g, '')
    .toUpperCase();
}

export function canLookup(
  value: string,
): boolean {
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

async function fetchHtml(
  url: string,
): Promise<string> {
  console.log(
    'FLIGHTERA REQUEST:',
    url,
  );

  const response = await fetch(url, {
    method: 'GET',

    headers: {
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',

      'Accept-Language':
        'en-US,en;q=0.9',
    },
  });

  console.log(
    'FLIGHTERA RESPONSE:',
    response.status,
    url,
  );

  if (response.status === 404) {
    throw new Error(
      'FLIGHT_NOT_FOUND',
    );
  }

  if (!response.ok) {
    throw new Error(
      `Flightera HTTP ${response.status}`,
    );
  }

  const html =
    await response.text();

  if (
    !html ||
    html.length < 100
  ) {
    throw new Error(
      'Flightera devolvió una respuesta vacía',
    );
  }

  return html;
}

function findFlightInJsonLd(
  value: unknown,
): FlighteraFlight | null {
  if (
    !value ||
    typeof value !== 'object'
  ) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found =
        findFlightInJsonLd(item);

      if (found) {
        return found;
      }
    }

    return null;
  }

  const object =
    value as Record<string, unknown>;

  if (
    object['@type'] === 'Flight'
  ) {
    return object as FlighteraFlight;
  }

  const graph =
    object['@graph'];

  if (Array.isArray(graph)) {
    for (const item of graph) {
      const found =
        findFlightInJsonLd(item);

      if (found) {
        return found;
      }
    }
  }

  return null;
}

function extractFlight(
  html: string,
): FlighteraFlight | null {
  const regex =
    /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (
    const match of html.matchAll(regex)
  ) {
    try {
      const parsed =
        JSON.parse(match[1]);

      const flight =
        findFlightInJsonLd(parsed);

      if (flight) {
        return flight;
      }
    } catch {
      // Ignorar JSON-LD inválido.
    }
  }

  return null;
}

function datePart(
  value?: string,
): string {
  if (!value) {
    return '';
  }

  return (
    value.match(
      /^(\d{4}-\d{2}-\d{2})T/,
    )?.[1] ?? ''
  );
}

function timePart(
  value?: string,
): string {
  if (!value) {
    return '';
  }

  const match =
    value.match(
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
  if (
    !departure ||
    !arrival
  ) {
    return undefined;
  }

  const departureMs =
    Date.parse(departure);

  const arrivalMs =
    Date.parse(arrival);

  if (
    !Number.isFinite(departureMs) ||
    !Number.isFinite(arrivalMs)
  ) {
    return undefined;
  }

  const minutes =
    Math.round(
      (arrivalMs - departureMs) /
        60000,
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

  const match =
    value.match(
      /([\d,.]+)\s*km/i,
    );

  if (!match) {
    return undefined;
  }

  const number =
    Number(
      match[1].replace(',', '.'),
    );

  return Number.isFinite(number)
    ? Math.round(number)
    : undefined;
}

/*
 * Algunos HTML de Flightera incluyen la matrícula directamente
 * y otros la cargan después mediante page_data.
 *
 * Solo usamos lo que ya esté presente en el HTML público.
 */
function extractRegistration(
  html: string,
  flight?: FlighteraFlight,
): string | undefined {
  const aircraftIdentifier =
    typeof flight?.aircraft === 'object'
      ? flight.aircraft.identifier
      : undefined;

  if (
    aircraftIdentifier &&
    /^[A-Z0-9]{1,3}-[A-Z0-9]{3,6}$/i.test(aircraftIdentifier.trim())
  ) {
    return aircraftIdentifier.trim().toUpperCase();
  }

  const jsonPatterns = [
    /"aircraftRegistration"\s*:\s*"([^"]+)"/i,
    /"registration"\s*:\s*"([^"]+)"/i,
  ];

  for (
    const pattern of jsonPatterns
  ) {
    const match =
      html.match(pattern);

    if (match?.[1]) {
      const value =
        match[1]
          .trim()
          .toUpperCase();

      if (
        /^[A-Z0-9]{1,3}-[A-Z0-9]{3,6}$/.test(
          value,
        )
      ) {
        return value;
      }
    }
  }

  /*
   * Ejemplos:
   * EC-MLE
   * D-AIXX
   * G-EUUK
   * EI-XYZ
   * 9H-ABC
   */
  const nearbyLabel =
    html.match(
      /(?:AIRCRAFT\s+)?REGISTRATION[\s\S]{0,800}?([A-Z0-9]{1,3}-[A-Z0-9]{3,6})/i,
    );

  if (nearbyLabel?.[1]) {
    return nearbyLabel[1]
      .toUpperCase();
  }

  return undefined;
}

function extractAircraftModel(
  html: string,
  flight?: FlighteraFlight,
): string | undefined {
  if (typeof flight?.aircraft === 'string' && flight.aircraft.trim()) {
    return flight.aircraft.trim();
  }

  if (typeof flight?.aircraft === 'object') {
    const schemaValue =
      flight.aircraft.model?.trim() ||
      flight.aircraft.name?.trim();

    if (schemaValue) {
      return schemaValue;
    }
  }

  const normalizedHtml = html
    .replace(/&quot;/gi, '"')
    .replace(/\\u002D/gi, '-');

  const jsonPatterns = [
    /"aircraftModel"\s*:\s*"([^"<>]{2,60})"/i,
    /"aircraft_model"\s*:\s*"([^"<>]{2,60})"/i,
    /"aircraftType"\s*:\s*"([^"<>]{2,60})"/i,
    /"aircraft_type"\s*:\s*"([^"<>]{2,60})"/i,
  ];

  for (const pattern of jsonPatterns) {
    const match = normalizedHtml.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  const visibleText = normalizedHtml
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

  const commonModel = visibleText.match(
    /\b(Airbus\s+A\d{3}(?:-\d{2,3})?(?:neo)?|Boeing\s+7\d{2}(?:-\d{2,3})?(?:\s+MAX\s*\d+)?|Embraer\s+(?:E\s*)?\d{3}(?:-E2)?|ATR\s+(?:42|72)(?:-\d{3})?|Bombardier\s+(?:CRJ|Dash)\s*[A-Z0-9-]+)\b/i,
  );

  return commonModel?.[1]?.replace(/\s+/g, ' ').trim();
}

function findDetailUrlForDate(
  html: string,
  flightNumber: string,
  flightDate: string,
): string | undefined {
  const escapedFlight =
    flightNumber.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );

  const escapedDate =
    flightDate.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );

  const regex =
    new RegExp(
      `(?:https:\\/\\/www\\.flightera\\.net)?(\\/en\\/flight_details\\/[^"'<>\\s]+\\/${escapedFlight}\\/[^"'<>\\s]+\\/${escapedDate})`,
      'i',
    );

  const match =
    html.match(regex);

  if (!match?.[1]) {
    return undefined;
  }

  return (
    `${FLIGHTERA_BASE}${match[1]}`
  );
}

function makeSuggestion(
  flight: FlighteraFlight,
  html: string,
  flightNumber: string,
  flightDate: string,
): LookupSuggestion | null {
  const resolvedNumber =
    flight.flightNumber
      ?.replace(/\s+/g, '')
      .toUpperCase();

  if (
    resolvedNumber !==
    flightNumber
  ) {
    return null;
  }

  if (
    datePart(
      flight.departureTime,
    ) !== flightDate
  ) {
    return null;
  }

  const departureCode =
    flight.departureAirport
      ?.iataCode
      ?.trim()
      .toUpperCase();

  const arrivalCode =
    flight.arrivalAirport
      ?.iataCode
      ?.trim()
      .toUpperCase();

  if (
    !departureCode ||
    !arrivalCode
  ) {
    return null;
  }

  const suggestion: LookupSuggestion = {
    kind: 'dated',
    source: 'flightera',

    flightNumber,
    flightDate,

    departureCode,

    departureName:
      flight.departureAirport
        ?.name
        ?.trim() ||
      undefined,

    arrivalCode,

    arrivalName:
      flight.arrivalAirport
        ?.name
        ?.trim() ||
      undefined,

    airlineCode:
      flight.provider
        ?.iataCode
        ?.trim()
        .toUpperCase() ||
      undefined,

    airlineName:
      flight.provider
        ?.name
        ?.trim() ||
      undefined,

    departureTime:
      timePart(
        flight.departureTime,
      ) ||
      undefined,

    arrivalTime:
      timePart(
        flight.arrivalTime,
      ) ||
      undefined,

    arrivalDate:
      datePart(
        flight.arrivalTime,
      ) ||
      undefined,

    durationMinutes:
      calculateDurationMinutes(
        flight.departureTime,
        flight.arrivalTime,
      ),

    distanceKm:
      parseDistanceKm(
        flight.flightDistance,
      ),

    registration:
      extractRegistration(html, flight),

    aircraftModel:
      extractAircraftModel(html, flight),

    scheduledDepartureAt:
      flight.departureTime || undefined,

    scheduledArrivalAt:
      flight.arrivalTime || undefined,
  };

  return suggestion;
}

export async function lookupFlight(
  flightNumber: string,
  date: Date,
): Promise<LookupSuggestion[]> {
  const number =
    normalizedFlightNumber(
      flightNumber,
    );

  const day =
    localDateKey(date);

  const cacheKey =
    `${number}:${day}`;

  const previous =
    cache.get(cacheKey);

  if (
    previous &&
    previous.expiresAt >
      Date.now()
  ) {
    return previous.result;
  }

  const result =
    requestFlightLookup(
      number,
      day,
    );

  cache.set(
    cacheKey,
    {
      expiresAt:
        Date.now() +
        5 * 60 * 1000,

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

function optionalString(
  value: unknown,
): string | undefined {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : undefined;
}

function optionalNumber(
  value: unknown,
): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function parseServerSuggestion(
  value: unknown,
  flightNumber: string,
  flightDate: string,
): LookupSuggestion | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const item = value as Record<string, unknown>;
  const departureCode = optionalString(item.departureCode)?.toUpperCase();
  const arrivalCode = optionalString(item.arrivalCode)?.toUpperCase();
  const resolvedNumber = normalizedFlightNumber(optionalString(item.flightNumber) ?? '');
  const resolvedDate = optionalString(item.flightDate);
  const kind = item.kind === 'dated' ? 'dated' : item.kind === 'route' ? 'route' : null;

  if (
    !kind ||
    resolvedNumber !== flightNumber ||
    resolvedDate !== flightDate ||
    !departureCode ||
    !arrivalCode ||
    !/^[A-Z]{3}$/.test(departureCode) ||
    !/^[A-Z]{3}$/.test(arrivalCode)
  ) {
    return null;
  }

  return {
    kind,
    source: item.source === 'airlabs' ? 'airlabs' : 'flightera',
    flightNumber,
    flightDate,
    departureCode,
    departureName: optionalString(item.departureName),
    arrivalCode,
    arrivalName: optionalString(item.arrivalName),
    departureTime: optionalString(item.departureTime),
    arrivalTime: optionalString(item.arrivalTime),
    arrivalDate: optionalString(item.arrivalDate),
    durationMinutes: optionalNumber(item.durationMinutes),
    aircraftModel: optionalString(item.aircraftModel),
    registration: optionalString(item.registration)?.toUpperCase(),
    airlineCode: optionalString(item.airlineCode)?.toUpperCase(),
    airlineName: optionalString(item.airlineName),
    distanceKm: optionalNumber(item.distanceKm),
    scheduledDepartureAt: optionalString(item.scheduledDepartureAt),
    scheduledArrivalAt: optionalString(item.scheduledArrivalAt),
  };
}

async function requestServerLookup(
  flightNumber: string,
  flightDate: string,
): Promise<LookupSuggestion[]> {
  if (!supabase) {
    return [];
  }

  const invocation = supabase.functions.invoke('flight-lookup', {
    body: {
      flightNumber,
      flightDate,
    },
  });

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('La búsqueda tardó demasiado')), 12000);
  });

  const { data, error } = await Promise.race([invocation, timeout]);

  if (error) {
    throw error;
  }

  const rawSuggestions: unknown[] =
    data && typeof data === 'object' && Array.isArray(data.suggestions)
      ? data.suggestions
      : [];

  return rawSuggestions
    .map((item) => parseServerSuggestion(item, flightNumber, flightDate))
    .filter((item): item is LookupSuggestion => Boolean(item));
}
async function requestFlightLookup(
  flightNumber: string,
  flightDate: string,
): Promise<LookupSuggestion[]> {
  try {
    const serverSuggestions = await requestServerLookup(
      flightNumber,
      flightDate,
    );

    if (serverSuggestions.length) {
      return serverSuggestions;
    }
  } catch (error) {
    console.warn('SERVER FLIGHT LOOKUP ERROR:', error);
  }

  return requestFlighteraLookup(flightNumber, flightDate);
}

async function requestFlighteraLookup(
  flightNumber: string,
  flightDate: string,
): Promise<LookupSuggestion[]> {
  try {
    /*
     * 1. Resolver el vuelo genérico.
     */
    const genericUrl =
      `${FLIGHTERA_BASE}` +
      `/en/flight/` +
      encodeURIComponent(
        flightNumber,
      );

    const genericHtml =
      await fetchHtml(
        genericUrl,
      );

    const genericFlight =
      extractFlight(
        genericHtml,
      );

    if (!genericFlight) {
      console.log(
        'NO GENERIC FLIGHT JSON-LD',
      );

      return [];
    }

    /*
     * Para vuelos actuales/futuros:
     *
     * si la propia página genérica ya corresponde
     * exactamente a la fecha pedida, no necesitamos
     * hacer una segunda resolución.
     */
    if (
      datePart(
        genericFlight.departureTime,
      ) === flightDate
    ) {
      const currentSuggestion =
        makeSuggestion(
          genericFlight,
          genericHtml,
          flightNumber,
          flightDate,
        );

      if (currentSuggestion) {
        console.log(
          'FLIGHTERA CURRENT/FUTURE RESULT:',
          JSON.stringify(
            currentSuggestion,
            null,
            2,
          ),
        );

        return [
          currentSuggestion,
        ];
      }
    }

    /*
     * Intentar primero encontrar en el HTML
     * un enlace exacto para la fecha solicitada.
     *
     * Esto mejora especialmente vuelos futuros
     * cuando Flightera ya los lista.
     */
    let detailUrl =
      findDetailUrlForDate(
        genericHtml,
        flightNumber,
        flightDate,
      );

    const originIata =
      genericFlight
        .departureAirport
        ?.iataCode
        ?.trim()
        .toUpperCase();

    console.log(
      'FLIGHTERA ORIGIN:',
      originIata,
    );

    /*
     * Si no aparece enlace explícito, usar el
     * endpoint que ya hemos verificado:
     *
     * /flight_details/VY2616/VY2616/AGP/YYYY-MM-DD
     */
    if (!detailUrl) {
      if (
        !originIata ||
        !/^[A-Z]{3}$/.test(
          originIata,
        )
      ) {
        return [];
      }

      detailUrl =
        `${FLIGHTERA_BASE}` +
        `/en/flight_details/` +
        `${encodeURIComponent(
          flightNumber,
        )}/` +
        `${encodeURIComponent(
          flightNumber,
        )}/` +
        `${encodeURIComponent(
          originIata,
        )}/` +
        `${encodeURIComponent(
          flightDate,
        )}`;
    }

    console.log(
      'FLIGHTERA DETAIL URL:',
      detailUrl,
    );

    const detailHtml =
      await fetchHtml(
        detailUrl,
      );

    const detailFlight =
      extractFlight(
        detailHtml,
      );

    if (!detailFlight) {
      console.log(
        'NO DETAIL FLIGHT JSON-LD',
      );

      return [];
    }

    const suggestion =
      makeSuggestion(
        detailFlight,
        detailHtml,
        flightNumber,
        flightDate,
      );

    if (!suggestion) {
      console.log(
        'DETAIL FLIGHT DID NOT MATCH REQUESTED DATE',
        flightDate,
        detailFlight.departureTime,
      );

      return [];
    }

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

  const sourceName = suggestion.source === 'airlabs'
    ? 'AirLabs'
    : 'Flightera';
  const source = `${sourceName}:${suggestion.kind}`;
  const fieldSources = { ...draft.fieldSources };
  const departureAirport = getAirport(suggestion.departureCode);
  const arrivalAirport = getAirport(suggestion.arrivalCode);
  const catalogDistance = routeDistanceKm(
    departureAirport,
    arrivalAirport,
  );

  // Una nueva consulta solo rellena campos vacíos o actualiza campos que ya
  // procedían de otra consulta. Las correcciones manuales siempre prevalecen.
  function mergeAutomatic(field: keyof FlightDraft, current: string, incoming?: string | null) {
    if (!incoming || (current && !draft.fieldSources[field])) return current;
    fieldSources[field] = source;
    return incoming;
  }

  return {
    ...draft,

    fieldSources,

    airlineName: mergeAutomatic('airlineName', draft.airlineName, suggestion.airlineName || suggestion.airlineCode),
    departureCode: mergeAutomatic('departureCode', draft.departureCode, suggestion.departureCode),
    departureName: mergeAutomatic('departureName', draft.departureName, suggestion.departureName || departureAirport?.name),
    arrivalCode: mergeAutomatic('arrivalCode', draft.arrivalCode, suggestion.arrivalCode),
    arrivalName: mergeAutomatic('arrivalName', draft.arrivalName, suggestion.arrivalName || arrivalAirport?.name),
    departureTime: mergeAutomatic('departureTime', draft.departureTime, suggestion.departureTime),
    arrivalTime: mergeAutomatic('arrivalTime', draft.arrivalTime, suggestion.arrivalTime),
    arrivalDate: mergeAutomatic('arrivalDate', draft.arrivalDate, suggestion.arrivalDate),
    durationMinutes: mergeAutomatic('durationMinutes', draft.durationMinutes, suggestion.durationMinutes != null ? String(suggestion.durationMinutes) : undefined),
    distanceKm: mergeAutomatic('distanceKm', draft.distanceKm, suggestion.distanceKm != null ? String(suggestion.distanceKm) : catalogDistance != null ? String(catalogDistance) : undefined),
    scheduledDepartureAt: mergeAutomatic('scheduledDepartureAt', draft.scheduledDepartureAt, suggestion.scheduledDepartureAt),
    scheduledArrivalAt: mergeAutomatic('scheduledArrivalAt', draft.scheduledArrivalAt, suggestion.scheduledArrivalAt),
    aircraftModel: mergeAutomatic('aircraftModel', draft.aircraftModel, suggestion.aircraftModel),
    registration: mergeAutomatic('registration', draft.registration, suggestion.registration),
  };
}
