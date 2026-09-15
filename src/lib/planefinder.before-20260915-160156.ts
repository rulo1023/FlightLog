export type PlaneFinderAircraftResult = {
  registration: string;
  aircraftModel?: string;
};

const MONTHS: Record<string, string> = {
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12',
};

function normalizeFlightNumber(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

function htmlToText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function planeFinderDateToKey(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);

  if (!match) {
    return null;
  }

  const month = MONTHS[match[2]];

  if (!month) {
    return null;
  }

  return `${match[3]}-${month}-${String(Number(match[1])).padStart(2, '0')}`;
}

export function isWithinPlaneFinderWindow(dateKey: string): boolean {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return false;
  }

  const target = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const diffDays =
    Math.floor((today.getTime() - target.getTime()) / 86400000);

  return diffDays >= 0 && diffDays <= 7;
}

export function parsePlaneFinderAircraft(
  html: string,
  flightDate: string,
  departureCode: string,
  arrivalCode: string,
): PlaneFinderAircraftResult | null {
  const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];

  const wantedDeparture = departureCode.trim().toUpperCase();
  const wantedArrival = arrivalCode.trim().toUpperCase();

  for (const row of rows) {
    const dateMatch = row.match(/<td[^>]*>\s*(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s*<\/td>/i);

    if (!dateMatch) {
      continue;
    }

    const rowDate = planeFinderDateToKey(dateMatch[1]);

    if (rowDate !== flightDate) {
      continue;
    }

    const airports = Array.from(
      row.matchAll(/\/data\/airport\/([A-Z0-9]{3,4})/gi),
    ).map((match) => match[1].toUpperCase());

    if (
      !airports.includes(wantedDeparture) ||
      !airports.includes(wantedArrival)
    ) {
      continue;
    }

    const registrationMatch = row.match(
      /\/data\/aircraft\/([A-Z0-9-]+)/i,
    );

    if (!registrationMatch) {
      continue;
    }

    const cells = Array.from(
      row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi),
    ).map((match) => htmlToText(match[1]));

    let aircraftModel: string | undefined;

    if (cells.length >= 7) {
      const candidate = cells[cells.length - 3]?.trim();

      if (
        candidate &&
        candidate.toLowerCase() !== 'unknown' &&
        !candidate.includes(':')
      ) {
        aircraftModel = candidate;
      }
    }

    return {
      registration: registrationMatch[1].toUpperCase(),
      aircraftModel,
    };
  }

  return null;
}

export async function lookupPlaneFinderAircraft(
  flightNumber: string,
  flightDate: string,
  departureCode: string,
  arrivalCode: string,
): Promise<PlaneFinderAircraftResult | null> {
  if (!isWithinPlaneFinderWindow(flightDate)) {
    return null;
  }

  const normalizedFlight = normalizeFlightNumber(flightNumber);

  if (!normalizedFlight || !departureCode || !arrivalCode) {
    return null;
  }

  const url =
    `https://planefinder.net/data/flight/${encodeURIComponent(normalizedFlight)}`;

  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`Plane Finder HTTP ${response.status}`);
  }

  const html = await response.text();

  return parsePlaneFinderAircraft(
    html,
    flightDate,
    departureCode,
    arrivalCode,
  );
}
