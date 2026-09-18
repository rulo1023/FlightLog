import { airlineBrands } from '../data/airlineColors';

const fallbackAirlineColors = [
  '#247B78', '#3A62A8', '#7A4EAB', '#B64C64',
  '#A45C22', '#337A55', '#405B73', '#8A5B35',
];

function stableIndex(value: string, length: number) {
  let hash = 0;
  for (const character of value) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return Math.abs(hash) % length;
}

export function airlineAppearance(flightNumber?: string | null, airlineName?: string | null) {
  const code = (flightNumber ?? '').replace(/\s+/g, '').toUpperCase();
  const name = (airlineName ?? '').toUpperCase();
  const brand = airlineBrands.find(({ codes, names }) =>
    codes.some((token) => code.startsWith(token)) || names.some((token) => name.includes(token)),
  );
  if (brand) return brand;
  const background = fallbackAirlineColors[stableIndex(name || code, fallbackAirlineColors.length)];
  return { background, text: '#FFFFFF' };
}

export type AircraftAppearance = {
  manufacturer: string;
  size: 'regional' | 'narrow' | 'wide' | 'unknown';
  sizeLabel: string;
  color: string;
  background: string;
  iconSize: number;
};

export function aircraftAppearance(model?: string | null): AircraftAppearance {
  const value = (model ?? '').toUpperCase();
  let manufacturer = 'Avión';
  let color = '#607D8B';
  let background = '#E8EEF0';

  if (/AIRBUS|\bA[23]\d{2}/.test(value)) {
    manufacturer = 'Airbus'; color = '#2878C8'; background = '#E4F0FC';
  } else if (/BOEING|\b7[3-8]7/.test(value)) {
    manufacturer = 'Boeing'; color = '#6356B5'; background = '#ECE9FA';
  } else if (/EMBRAER|\bE\d{3}\b|E-JET/.test(value)) {
    manufacturer = 'Embraer'; color = '#14877C'; background = '#DFF3EF';
  } else if (/ATR/.test(value)) {
    manufacturer = 'ATR'; color = '#458243'; background = '#E5F2E3';
  } else if (/BOMBARDIER|CANADAIR|\bCRJ/.test(value)) {
    manufacturer = 'Bombardier'; color = '#A04A86'; background = '#F5E4EF';
  }

  const wide = /A330|A340|A350|A380|747|767|777|787/.test(value);
  const regional = /ATR|CRJ|EMBRAER|\bE1[789]\d\b|\bE2\d{2}\b|DASH|Q400/.test(value);
  const size = wide ? 'wide' : regional ? 'regional' : value ? 'narrow' : 'unknown';
  const sizeLabel = size === 'wide' ? 'Fuselaje ancho' : size === 'regional' ? 'Regional' : size === 'narrow' ? 'Pasillo único' : 'Modelo sin indicar';

  return { manufacturer, size, sizeLabel, color, background, iconSize: size === 'wide' ? 23 : size === 'regional' ? 16 : 19 };
}
