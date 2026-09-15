
async function debugFlighteraPageData(
  html: string,
  detailUrl: string,
) {
  const endpointMatch = html.match(
    /data-endpoint=["']([^"']+)["']/i,
  );

  const tokenMatch = html.match(
    /data-auth-token=["']([^"']+)["']/i,
  );

  if (!endpointMatch?.[1]) {
    console.log(
      'FLIGHTERA PAGE DATA: no endpoint',
    );
    return;
  }

  if (!tokenMatch?.[1]) {
    console.log(
      'FLIGHTERA PAGE DATA: no auth token',
    );
    return;
  }

  const endpoint =
    endpointMatch[1].startsWith('http')
      ? endpointMatch[1]
      : `https://www.flightera.net${endpointMatch[1]}`;

  console.log(
    'FLIGHTERA PAGE DATA ENDPOINT:',
    endpoint,
  );

  try {
    const response = await fetch(endpoint, {
      method: 'GET',

      headers: {
        Accept: 'application/json,text/html,*/*',

        Authorization:
          tokenMatch[1],

        Referer:
          detailUrl,

        'Accept-Language':
          'en-US,en;q=0.9',
      },
    });

    console.log(
      'FLIGHTERA PAGE DATA STATUS:',
      response.status,
    );

    const body =
      await response.text();

    console.log(
      'FLIGHTERA PAGE DATA LENGTH:',
      body.length,
    );

    console.log(
      'FLIGHTERA PAGE DATA PREVIEW:',
      body.slice(0, 1500),
    );

    const terms = [
      'registration',
      'aircraft',
      'aircraft_type',
      'aircraftType',
      'model',
      'Airbus',
      'Boeing',
      'Embraer',
      'EC-',
    ];

    for (const term of terms) {
      const index =
        body
          .toLowerCase()
          .indexOf(
            term.toLowerCase(),
          );

      if (index >= 0) {
        console.log(
          `FLIGHTERA PAGE DATA ${term}:`,
          body.slice(
            Math.max(0, index - 300),
            Math.min(
              body.length,
              index + 700,
            ),
          ),
        );
      }
    }
  } catch (error) {
    console.error(
      'FLIGHTERA PAGE DATA ERROR:',
      error,
    );
  }
}
import { FlightDraft, localDateKey } from './flights';

export type LookupSuggestion = {
  kind: 'dated' | 'route';

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
      'Flightera devolviÃ³ una respuesta vacÃ­a',
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
      // Ignorar JSON-LD invÃ¡lido.
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
 * Algunos HTML de Flightera incluyen la matrÃ­cula directamente
 * y otros la cargan despuÃ©s mediante page_data.
 *
 * Solo usamos lo que ya estÃ© presente en el HTML pÃºblico.
 */
function extractRegistration(
  html: string,
): string | undefined {
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
      extractRegistration(html),

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
    requestFlighteraLookup(
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

async function requestFlighteraLookup(
  flightNumber: string,
  flightDate: string,
): Promise<LookupSuggestion[]> {
  try {
    /*
     * 1. Resolver el vuelo genÃ©rico.
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
     * si la propia pÃ¡gina genÃ©rica ya corresponde
     * exactamente a la fecha pedida, no necesitamos
     * hacer una segunda resoluciÃ³n.
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
     * Si no aparece enlace explÃ­cito, usar el
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

    await debugFlighteraPageData(
      detailHtml,
      detailUrl,
    );

    // FLIGHTERA AIRCRAFT DEBUG
    const aircraftDebugTerms = [
      'registration',
      'aircraft',
      'aircraftRegistration',
      'aircraftModel',
      'Airbus',
      'Boeing',
      'Embraer',
      'Bombardier',
      'ATR',
      'A319',
      'A320',
      'A321',
      'B737',
      'B738',
      'B38M',
      'E190',
      'E195',
    ];

    for (const term of aircraftDebugTerms) {
      const index = detailHtml
        .toLowerCase()
        .indexOf(term.toLowerCase());

      if (index >= 0) {
        const start = Math.max(0, index - 250);
        const end = Math.min(
          detailHtml.length,
          index + 500,
        );

        console.log(
          `FLIGHTERA DEBUG ${term}:`,
          detailHtml.slice(start, end),
        );
      }
    }

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

  const source =
    `Flightera:${suggestion.kind}`;

  const fieldSources = {
    ...draft.fieldSources,
  };

  fieldSources.departureCode =
    source;

  fieldSources.arrivalCode =
    source;

  if (suggestion.departureName) {
    fieldSources.departureName =
      source;
  }

  if (suggestion.arrivalName) {
    fieldSources.arrivalName =
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


  if (suggestion.distanceKm != null) {
    fieldSources.distanceKm =
      source;
  }

  if (suggestion.aircraftModel) {
    fieldSources.aircraftModel =
      source;
  }

  if (suggestion.registration) {
    fieldSources.registration =
      source;
  }

  if (suggestion.airlineName) {
    fieldSources.airlineName =
      source;
  }

  return {
    ...draft,

    fieldSources,

    airlineName:
      suggestion.airlineName ||
      draft.airlineName ||
      suggestion.airlineCode ||
      '',

    departureCode:
      suggestion.departureCode,

    departureName:
      suggestion.departureName ||
      draft.departureName,

    arrivalCode:
      suggestion.arrivalCode,

    arrivalName:
      suggestion.arrivalName ||
      draft.arrivalName,

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

    distanceKm:
      suggestion.distanceKm != null
        ? String(
            suggestion.distanceKm,
          )
        : draft.distanceKm,

    scheduledDepartureAt:
      suggestion.scheduledDepartureAt ||
      draft.scheduledDepartureAt,

    scheduledArrivalAt:
      suggestion.scheduledArrivalAt ||
      draft.scheduledArrivalAt,

    aircraftModel:
      suggestion.aircraftModel ||
      draft.aircraftModel,

    registration:
      suggestion.registration ||
      draft.registration,
  };
}