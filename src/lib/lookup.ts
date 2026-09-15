import { FlightDraft, localDateKey } from './flights';
import { supabase } from './supabase';

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
};

export function normalizedFlightNumber(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

export function canLookup(value: string): boolean {
  return /^[A-Z0-9]{2,3}\d{1,6}[A-Z]?$/.test(normalizedFlightNumber(value));
}

const cache = new Map<string, { expiresAt: number; result: Promise<LookupSuggestion[]> }>();

export async function lookupFlight(flightNumber: string, date: Date): Promise<LookupSuggestion[]> {
  if (!supabase) return [];
  const number = normalizedFlightNumber(flightNumber);
  const day = localDateKey(date);
  const cacheKey = `${number}:${day}`;
  const previous = cache.get(cacheKey);
  if (previous && previous.expiresAt > Date.now()) return previous.result;
  const result = requestLookup(number, day);
  cache.set(cacheKey, { expiresAt: Date.now() + 5 * 60000, result });
  try { return await result; }
  catch (error) { cache.delete(cacheKey); throw error; }
}

async function requestLookup(flightNumber: string, flightDate: string): Promise<LookupSuggestion[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.functions.invoke('flight-lookup', {
    body: { flightNumber, flightDate },
  });
  if (error) throw error;
  if (!data || !Array.isArray(data.suggestions)) return [];
  return data.suggestions as LookupSuggestion[];
}

export function applySuggestion(draft: FlightDraft, suggestion: LookupSuggestion): FlightDraft {
  if (normalizedFlightNumber(draft.flightNumber) !== suggestion.flightNumber || localDateKey(draft.flightDate) !== suggestion.flightDate) return draft;
  const source = `AirLabs:${suggestion.kind}`;
  const fieldSources = { ...draft.fieldSources };
  for (const field of ['departureCode', 'arrivalCode']) fieldSources[field] = source;
  if (suggestion.departureTime) fieldSources.departureTime = source;
  if (suggestion.arrivalTime) fieldSources.arrivalTime = source;
  if (suggestion.arrivalDate) fieldSources.arrivalDate = source;
  if (suggestion.durationMinutes != null) fieldSources.durationMinutes = source;
  if (suggestion.aircraftModel) fieldSources.aircraftModel = source;
  if (suggestion.kind === 'dated' && suggestion.registration) fieldSources.registration = source;
  return {
    ...draft,
    fieldSources,
    airlineName: draft.airlineName || suggestion.airlineCode || '',
    departureCode: suggestion.departureCode,
    arrivalCode: suggestion.arrivalCode,
    departureTime: suggestion.departureTime || draft.departureTime,
    arrivalTime: suggestion.arrivalTime || draft.arrivalTime,
    arrivalDate: suggestion.arrivalDate || draft.arrivalDate,
    durationMinutes: suggestion.durationMinutes != null ? String(suggestion.durationMinutes) : draft.durationMinutes,
    aircraftModel: suggestion.aircraftModel || draft.aircraftModel,
    registration: suggestion.kind === 'dated' ? suggestion.registration || draft.registration : draft.registration,
  };
}
