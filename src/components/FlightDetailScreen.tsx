import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { aircraftAppearance, airlineAppearance } from '../lib/flightVisuals';
import { actualScheduleSource, Flight, flightNumberLabel, formatDuration, shortDateLabel } from '../lib/flights';
import { airportPlace, countryFlag, formatInTimeZone, getAirport, localDateTimeParts, routeDistanceKm } from '../lib/airports';
import { ThemeColors } from '../theme';
import { AircraftRegistrationCard } from './AircraftPhotoCard';
import { FlightRouteMap } from './FlightRouteMap';
import { RouteDetailModal, routeKey, routeSummaries } from './GlobalMapScreen';

function SourceTag({ automatic, colors }: { automatic: boolean; colors: ThemeColors }) {
  return (
    <View style={[styles.sourceTag, { backgroundColor: automatic ? colors.primarySoft : colors.input }]}>
      <Ionicons name={automatic ? 'sparkles-outline' : 'create-outline'} size={11} color={automatic ? colors.primary : colors.muted} />
      <Text style={[styles.sourceText, { color: automatic ? colors.primary : colors.muted }]}>{automatic ? 'Automático' : 'Manual'}</Text>
    </View>
  );
}

function DetailRow({ label, value, sourceKey, flight, colors }: {
  label: string; value?: string | number | null; sourceKey?: string; flight: Flight; colors: ThemeColors;
}) {
  if (value == null || value === '') return null;
  return (
    <View style={[styles.detailRow, { borderBottomColor: colors.line }]}>
      <View style={styles.detailText}>
        <Text style={[styles.detailLabel, { color: colors.muted }]}>{label}</Text>
        <Text style={[styles.detailValue, { color: colors.ink }]}>{value}</Text>
      </View>
      {sourceKey ? <SourceTag automatic={Boolean(flight.field_sources?.[sourceKey])} colors={colors} /> : null}
    </View>
  );
}

function AirportPanel({ code, fallbackName, side, colors }: {
  code?: string | null; fallbackName?: string | null; side: 'Salida' | 'Llegada'; colors: ThemeColors;
}) {
  const airport = getAirport(code);
  return (
    <View style={[styles.airportPanel, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <View style={styles.airportPanelTop}>
        <Text style={styles.flag}>{countryFlag(airport?.countryCode)}</Text>
        <Text style={[styles.airportCode, { color: colors.ink }]}>{code || '---'}</Text>
      </View>
      <Text style={[styles.airportSide, { color: colors.primary }]}>{side}</Text>
      <Text style={[styles.airportCity, { color: colors.ink }]}>{airportPlace(airport, fallbackName)}</Text>
      <Text numberOfLines={2} style={[styles.airportName, { color: colors.muted }]}>{airport?.name || fallbackName || 'Sin información local'}</Text>
      {airport ? <Text style={[styles.airportExtra, { color: colors.muted }]}>{airport.icao || airport.iata} · {airport.country}</Text> : null}
      {airport?.timeZone ? <Text style={[styles.localClock, { color: colors.primary }]}>Ahora {formatInTimeZone(new Date(), airport.timeZone)}</Text> : null}
    </View>
  );
}

export function FlightDetailScreen({ flight, flights, colors, onBack, onEdit, onOpenFlight, onApplyActualTimes, updatingActual = false }: {
  flight: Flight; colors: ThemeColors;
  flights: Flight[];
  onBack: () => void; onEdit: () => void;
  onOpenFlight: (flight: Flight) => void;
  onApplyActualTimes: () => void;
  updatingActual?: boolean;
}) {
  const [showRouteHistory, setShowRouteHistory] = useState(false);
  const airline = airlineAppearance(flight.flight_number, flight.airline_name);
  const aircraft = aircraftAppearance(flight.aircraft_model);
  const departureAirport = getAirport(flight.departure_airport_code);
  const arrivalAirport = getAirport(flight.arrival_airport_code);
  const calculatedDistance = routeDistanceKm(departureAirport, arrivalAirport);
  const distance = flight.distance_km != null ? Math.round(Number(flight.distance_km)) : calculatedDistance;
  const required = [
    flight.airline_name, flight.departure_airport_code, flight.arrival_airport_code,
    flight.departure_time_local, flight.arrival_time_local, flight.duration_minutes,
    flight.aircraft_model, flight.aircraft_registration,
  ];
  const missing = required.filter((value) => value == null || value === '').length;
  const updated = flight.updated_at || flight.created_at;
  const actualDeparture = localDateTimeParts(flight.actual_departure_at, departureAirport?.timeZone);
  const actualArrival = localDateTimeParts(flight.actual_arrival_at, arrivalAirport?.timeZone);
  const scheduledDeparture = localDateTimeParts(flight.scheduled_departure_at, departureAirport?.timeZone);
  const scheduledArrival = localDateTimeParts(flight.scheduled_arrival_at, arrivalAirport?.timeZone);
  const actualScheduleApplied =
    (!actualDeparture || flight.field_sources?.departureTime === actualScheduleSource) &&
    (!actualArrival || flight.field_sources?.arrivalTime === actualScheduleSource);
  const hasActualSchedule = Boolean(actualDeparture || actualArrival);
  const currentRouteKey = routeKey(flight);
  const routeFlights = useMemo(
    () => currentRouteKey
      ? flights.filter((item) => routeKey(item) === currentRouteKey)
      : [],
    [currentRouteKey, flights],
  );
  const routeSummary = useMemo(
    () => routeSummaries(routeFlights)[0] ?? null,
    [routeFlights],
  );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={[styles.headerButton, { backgroundColor: colors.surface }]} accessibilityLabel="Volver"><Ionicons name="arrow-back" size={23} color={colors.ink} /></Pressable>
        <Text style={[styles.headerTitle, { color: colors.ink }]}>Detalle del vuelo</Text>
        <Pressable onPress={onEdit} style={[styles.editButton, { backgroundColor: colors.primarySoft }]}><Ionicons name="create-outline" size={18} color={colors.primary} /><Text style={[styles.editText, { color: colors.primary }]}>Editar</Text></Pressable>
      </View>

      <View style={[styles.hero, { backgroundColor: airline.background }]}>
        <View style={styles.heroTop}>
          <View style={styles.flightCode}><Ionicons name="airplane" size={18} color={airline.text} /><Text style={[styles.flightCodeText, { color: airline.text }]}>{flightNumberLabel(flight.flight_number)}</Text></View>
          <Text style={[styles.heroDate, { color: airline.text }]}>{shortDateLabel(flight.flight_date)}</Text>
        </View>
        <View style={styles.route}>
          <View style={styles.routeEndpoint}><Text style={[styles.routeCode, { color: airline.text }]}>{flight.departure_airport_code || '---'}</Text><Text style={[styles.routeCity, { color: airline.text }]}>{airportPlace(departureAirport, flight.departure_airport_name)}</Text></View>
          <View style={styles.routePath}><View style={[styles.routeDash, { backgroundColor: airline.text }]} /><Ionicons name="airplane" size={24} color={airline.text} /><View style={[styles.routeDash, { backgroundColor: airline.text }]} /></View>
          <View style={[styles.routeEndpoint, styles.routeEndpointRight]}><Text style={[styles.routeCode, { color: airline.text }]}>{flight.arrival_airport_code || '---'}</Text><Text style={[styles.routeCity, { color: airline.text }]}>{airportPlace(arrivalAirport, flight.arrival_airport_name)}</Text></View>
        </View>
        <View style={styles.timeLine}>
          <View><Text style={[styles.timeLabel, { color: airline.text }]}>{flight.field_sources?.departureTime === actualScheduleSource ? 'Salida real' : 'Salida prevista'}</Text><Text style={[styles.timeValue, { color: airline.text }]}>{flight.departure_time_local?.slice(0, 5) || '--:--'}</Text></View>
          <Text style={[styles.duration, { color: airline.text }]}>{formatDuration(flight.duration_minutes) || 'Duración pendiente'}</Text>
          <View style={styles.timeRight}><Text style={[styles.timeLabel, { color: airline.text }]}>{flight.field_sources?.arrivalTime === actualScheduleSource ? 'Llegada real' : 'Llegada prevista'}</Text><Text style={[styles.timeValue, { color: airline.text }]}>{flight.arrival_time_local?.slice(0, 5) || '--:--'}</Text></View>
        </View>
      </View>

      {hasActualSchedule ? (
        <View style={[styles.scheduleCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.scheduleCardHeading}>
            <View style={[styles.scheduleIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="time-outline" size={21} color={colors.primary} /></View>
            <View style={styles.scheduleCardTitle}>
              <Text style={[styles.cardTitle, { color: colors.ink, marginBottom: 2 }]}>Horarios del vuelo</Text>
              <Text style={[styles.scheduleIntro, { color: colors.muted }]}>El horario real se conserva aparte hasta que decidas aplicarlo.</Text>
            </View>
          </View>
          <View style={styles.scheduleRows}>
            <View style={[styles.scheduleRow, { backgroundColor: colors.input }]}>
              <Text style={[styles.scheduleRowLabel, { color: colors.muted }]}>Previsto</Text>
              <Text style={[styles.scheduleRowValue, { color: colors.ink }]}>{scheduledDeparture?.time || (!actualScheduleApplied ? flight.departure_time_local?.slice(0, 5) : null) || '--:--'} → {scheduledArrival?.time || (!actualScheduleApplied ? flight.arrival_time_local?.slice(0, 5) : null) || '--:--'}</Text>
            </View>
            <View style={[styles.scheduleRow, { backgroundColor: colors.primarySoft }]}>
              <Text style={[styles.scheduleRowLabel, { color: colors.primary }]}>Real</Text>
              <Text style={[styles.scheduleRowValue, { color: colors.ink }]}>{actualDeparture?.time || '--:--'} → {actualArrival?.time || '--:--'}</Text>
            </View>
          </View>
          <Pressable
            disabled={actualScheduleApplied || updatingActual}
            onPress={onApplyActualTimes}
            style={[
              styles.applyScheduleButton,
              { backgroundColor: actualScheduleApplied ? colors.input : colors.primary },
              (actualScheduleApplied || updatingActual) && styles.disabledButton,
            ]}
            accessibilityRole="button"
          >
            <Ionicons name={actualScheduleApplied ? 'checkmark' : 'refresh'} size={18} color={actualScheduleApplied ? colors.muted : colors.onPrimary} />
            <Text style={[styles.applyScheduleText, { color: actualScheduleApplied ? colors.muted : colors.onPrimary }]}>{updatingActual ? 'Actualizando…' : actualScheduleApplied ? 'Horario real aplicado' : 'Actualizar con el horario real'}</Text>
          </Pressable>
        </View>
      ) : null}

      {departureAirport && arrivalAirport ? (
        <View style={[styles.mapCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.mapHeading}>
            <View style={styles.mapHeadingText}>
              <Text style={[styles.mapEyebrow, { color: colors.primary }]}>TU RUTA</Text>
              <Text style={[styles.mapTitle, { color: colors.ink }]}>{airportPlace(departureAirport)} → {airportPlace(arrivalAirport)}</Text>
            </View>
            {distance ? <Text style={[styles.mapDistance, { color: colors.muted }]}>{distance.toLocaleString('es-ES')} km</Text> : null}
          </View>
          <View style={styles.mapClip}><FlightRouteMap flights={[flight]} colors={colors} focused height={245} /></View>
        </View>
      ) : null}

      {routeSummary ? (
        <Pressable
          onPress={() => setShowRouteHistory(true)}
          style={[styles.routeHistoryLink, { backgroundColor: colors.surface, borderColor: colors.line }]}
          accessibilityRole="button"
        >
          <View style={[styles.routeHistoryIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="git-branch-outline" size={21} color={colors.primary} /></View>
          <View style={styles.routeHistoryText}>
            <Text style={[styles.routeHistoryTitle, { color: colors.ink }]}>{routeFlights.length > 1 ? 'Otros vuelos en esta ruta' : 'Historia de esta ruta'}</Text>
            <Text style={[styles.routeHistoryMeta, { color: colors.muted }]}>{routeFlights.length} {routeFlights.length === 1 ? 'vuelo guardado' : 'vuelos guardados'} · primera y última vez, aerolíneas y aviones</Text>
          </View>
          <Ionicons name="chevron-forward" size={19} color={colors.primary} />
        </Pressable>
      ) : null}

      <View style={styles.airportsRow}>
        <AirportPanel code={flight.departure_airport_code} fallbackName={flight.departure_airport_name} side="Salida" colors={colors} />
        <AirportPanel code={flight.arrival_airport_code} fallbackName={flight.arrival_airport_name} side="Llegada" colors={colors} />
      </View>

      {(flight.aircraft_model || flight.aircraft_registration) ? (
        <View style={styles.aircraftPhotoCard}>
          <AircraftRegistrationCard flight={flight} count={1} colors={colors} />
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Text style={[styles.cardTitle, { color: colors.ink }]}>El vuelo</Text>
        <DetailRow label="Aerolínea" value={flight.airline_name} sourceKey="airlineName" flight={flight} colors={colors} />
        <DetailRow label="Duración" value={formatDuration(flight.duration_minutes)} sourceKey="durationMinutes" flight={flight} colors={colors} />
        <DetailRow label={flight.distance_km != null ? 'Distancia' : 'Distancia aproximada'} value={distance ? `${distance.toLocaleString('es-ES')} km` : null} sourceKey={flight.distance_km != null ? 'distanceKm' : undefined} flight={flight} colors={colors} />
        <DetailRow label="Fecha de llegada" value={flight.arrival_date ? shortDateLabel(flight.arrival_date) : null} sourceKey="arrivalDate" flight={flight} colors={colors} />
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <View style={styles.aircraftHeading}><View style={[styles.aircraftIcon, { backgroundColor: aircraft.background }]}><Ionicons name="airplane" size={aircraft.iconSize + 3} color={aircraft.color} /></View><View><Text style={[styles.cardTitle, { color: colors.ink, marginBottom: 2 }]}>A bordo</Text><Text style={[styles.aircraftKind, { color: aircraft.color }]}>{aircraft.manufacturer} · {aircraft.sizeLabel}</Text></View></View>
        <DetailRow label="Modelo" value={flight.aircraft_model} sourceKey="aircraftModel" flight={flight} colors={colors} />
        <DetailRow label="Matrícula" value={flight.aircraft_registration} sourceKey="registration" flight={flight} colors={colors} />
        <DetailRow label="Asiento" value={flight.seat} flight={flight} colors={colors} />
        <DetailRow label="Clase" value={flight.cabin_class} flight={flight} colors={colors} />
      </View>

      {flight.notes ? <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}><Text style={[styles.cardTitle, { color: colors.ink }]}>Comentarios</Text><Text style={[styles.notes, { color: colors.muted }]}>{flight.notes}</Text></View> : null}

      <View style={[styles.qualityCard, { backgroundColor: missing ? colors.amber : colors.completedBackground }]}>
        <Ionicons name={missing ? 'information-circle-outline' : 'checkmark-circle-outline'} size={24} color={missing ? colors.ink : colors.completedText} />
        <View style={styles.qualityText}><Text style={[styles.qualityTitle, { color: colors.ink }]}>{missing ? `Faltan ${missing} detalles` : 'Información completa'}</Text><Text style={[styles.qualityDescription, { color: colors.muted }]}>{missing ? 'Puedes completarlos manualmente cuando quieras.' : 'Los datos principales de este vuelo están guardados.'}</Text><Text style={[styles.updated, { color: colors.muted }]}>Actualizado {new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(updated))}</Text></View>
      </View>
      {showRouteHistory && routeSummary ? (
        <RouteDetailModal
          route={routeSummary}
          flights={routeFlights}
          colors={colors}
          onClose={() => setShowRouteHistory(false)}
          onOpenFlight={onOpenFlight}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 50 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  headerButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, headerTitle: { fontSize: 18, fontWeight: '700' },
  editButton: { minHeight: 42, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }, editText: { fontSize: 13, fontWeight: '700' },
  hero: { borderRadius: 28, padding: 21, marginBottom: 14 }, heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  flightCode: { flexDirection: 'row', alignItems: 'center', gap: 7 }, flightCodeText: { fontSize: 17, fontWeight: '800' }, heroDate: { fontSize: 13, fontWeight: '600', opacity: 0.9 },
  route: { flexDirection: 'row', alignItems: 'center', marginTop: 28 }, routeEndpoint: { width: 84 }, routeEndpointRight: { alignItems: 'flex-end' },
  routeCode: { fontSize: 30, fontWeight: '800' }, routeCity: { fontSize: 11, fontWeight: '600', opacity: 0.85, marginTop: 2 }, routePath: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }, routeDash: { flex: 1, height: 1, opacity: 0.55 },
  timeLine: { marginTop: 22, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.45)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  timeLabel: { fontSize: 10, opacity: 0.75 }, timeValue: { fontSize: 20, fontWeight: '700', marginTop: 2 }, timeRight: { alignItems: 'flex-end' }, duration: { fontSize: 11, fontWeight: '600', opacity: 0.85, paddingBottom: 4 },
  scheduleCard: { borderRadius: 23, borderWidth: 1, padding: 17, marginBottom: 14 }, scheduleCardHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 }, scheduleIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, scheduleCardTitle: { flex: 1 }, scheduleIntro: { fontSize: 11, lineHeight: 16 },
  scheduleRows: { flexDirection: 'row', gap: 9, marginTop: 14 }, scheduleRow: { flex: 1, borderRadius: 14, padding: 12 }, scheduleRowLabel: { fontSize: 10, fontWeight: '700' }, scheduleRowValue: { fontSize: 15, fontWeight: '800', marginTop: 4 },
  applyScheduleButton: { minHeight: 47, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 12, paddingHorizontal: 12 }, applyScheduleText: { fontSize: 13, fontWeight: '800' }, disabledButton: { opacity: 0.72 },
  mapCard: { borderRadius: 23, borderWidth: 1, padding: 12, marginBottom: 14 }, mapHeading: { padding: 6, paddingBottom: 12, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }, mapHeadingText: { flex: 1 },
  mapEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 }, mapTitle: { fontSize: 15, fontWeight: '700', marginTop: 3 }, mapDistance: { fontSize: 12, fontWeight: '700' }, mapClip: { borderRadius: 17, overflow: 'hidden' },
  routeHistoryLink: { minHeight: 78, borderRadius: 21, borderWidth: 1, padding: 14, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 11 }, routeHistoryIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, routeHistoryText: { flex: 1 }, routeHistoryTitle: { fontSize: 15, fontWeight: '700' }, routeHistoryMeta: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  airportsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 }, airportPanel: { flex: 1, minHeight: 205, borderRadius: 21, borderWidth: 1, padding: 15 }, airportPanelTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, flag: { fontSize: 23 }, airportCode: { fontSize: 21, fontWeight: '800' }, airportSide: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 14 }, airportCity: { fontSize: 16, fontWeight: '700', marginTop: 5 }, airportName: { fontSize: 11, lineHeight: 15, marginTop: 4 }, airportExtra: { fontSize: 10, marginTop: 7 }, localClock: { fontSize: 11, fontWeight: '700', marginTop: 'auto', paddingTop: 10 },
  aircraftPhotoCard: { marginBottom: 14 },
  card: { borderRadius: 23, borderWidth: 1, padding: 18, marginBottom: 14 }, cardTitle: { fontSize: 18, fontWeight: '700', marginBottom: 10 },
  detailRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth }, detailText: { flex: 1 }, detailLabel: { fontSize: 11 }, detailValue: { fontSize: 15, fontWeight: '600', marginTop: 3 },
  sourceTag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 5 }, sourceText: { fontSize: 9, fontWeight: '700' },
  aircraftHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 7 }, aircraftIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, aircraftKind: { fontSize: 11, fontWeight: '700' },
  notes: { fontSize: 14, lineHeight: 21 }, qualityCard: { borderRadius: 21, padding: 17, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, qualityText: { flex: 1 }, qualityTitle: { fontSize: 15, fontWeight: '700' }, qualityDescription: { fontSize: 12, lineHeight: 17, marginTop: 3 }, updated: { fontSize: 10, marginTop: 9 },
});
