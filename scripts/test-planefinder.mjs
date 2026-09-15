const flightNumber = 'VY2616';
const flightDate = '2026-09-14';
const departureCode = 'AGP';
const arrivalCode = 'BIO';

const months = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04',
  May: '05', Jun: '06', Jul: '07', Aug: '08',
  Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

function dateKey(value) {
  const m = value.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!m || !months[m[2]]) return null;
  return `${m[3]}-${months[m[2]]}-${String(Number(m[1])).padStart(2, '0')}`;
}

const url = `https://planefinder.net/data/flight/${flightNumber}`;

console.log('GET', url);

const response = await fetch(url, {
  headers: {
    Accept: 'text/html,application/xhtml+xml',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36',
  },
});

console.log('HTTP', response.status);

const html = await response.text();
const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];

let found = null;

for (const row of rows) {
  const dm = row.match(/<td[^>]*>\s*(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s*<\/td>/i);
  if (!dm || dateKey(dm[1]) !== flightDate) continue;

  const airports = Array.from(
    row.matchAll(/\/data\/airport\/([A-Z0-9]{3,4})/gi),
  ).map((m) => m[1].toUpperCase());

  if (!airports.includes(departureCode) || !airports.includes(arrivalCode)) {
    continue;
  }

  const reg = row.match(/\/data\/aircraft\/([A-Z0-9-]+)/i);
  if (!reg) continue;

  const cells = Array.from(
    row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi),
  ).map((m) =>
    m[1]
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );

  found = {
    date: flightDate,
    route: `${departureCode}-${arrivalCode}`,
    aircraft: cells.at(-3),
    registration: reg[1],
  };

  break;
}

console.log('');
console.log('=== RESULTADO ===');
console.log(found);
