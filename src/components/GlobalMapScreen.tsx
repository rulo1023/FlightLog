import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { countryFlag, getAirport, routeDistanceKm } from '../lib/airports';
import { airlineAppearance } from '../lib/flightVisuals';
import { Flight, flightNumberLabel, localDateKey, shortDateLabel } from '../lib/flights';
import { ThemeColors } from '../theme';
import { AircraftRegistrationCard } from './AircraftPhotoCard';
import { FlightRouteMap, flightsWithMapCoordinates } from './FlightRouteMap';

type MapFilter = 'all' | 'flown' | 'planned';
type AirlineShare = { label: string; count: number; color: string };
export type RouteSummary = { key: string; label: string; count: number; flight: Flight; airlines: AirlineShare[] };

function isFlown(flight: Flight) {
  const today = localDateKey(new Date());
  return flight.flight_date < today || (flight.flight_date === today && Boolean(flight.actual_arrival_at));
}

function airlineLabel(flight: Flight) {
  return flight.airline_name?.trim() || flight.flight_number?.match(/^[A-Z0-9]+/)?.[0] || 'Sin aerolínea';
}

export function routeKey(flight: Flight) {
  if (!flight.departure_airport_code || !flight.arrival_airport_code) return null;
  return [flight.departure_airport_code, flight.arrival_airport_code].sort().join('-');
}

export function routeSummaries(flights: Flight[]): RouteSummary[] {
  const routes = new Map<string, RouteSummary>();
  flights.forEach((flight) => {
    if (!flight.departure_airport_code || !flight.arrival_airport_code) return;
    const key = routeKey(flight);
    if (!key) return;
    const label = airlineLabel(flight);
    const color = airlineAppearance(flight.flight_number, flight.airline_name).background;
    const route = routes.get(key);
    if (!route) {
      routes.set(key, {
        key,
        label: `${flight.departure_airport_code} → ${flight.arrival_airport_code}`,
        count: 1,
        flight,
        airlines: [{ label, count: 1, color }],
      });
      return;
    }
    route.count += 1;
    const airline = route.airlines.find((item) => item.label === label);
    if (airline) airline.count += 1;
    else route.airlines.push({ label, count: 1, color });
  });
  return [...routes.values()].map((route) => ({
    ...route,
    airlines: route.airlines.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  })).sort((a, b) => b.count - a.count || b.flight.flight_date.localeCompare(a.flight.flight_date));
}

function routeAircraft(flights: Flight[]) {
  const registrations = new Map<string, { flight: Flight; count: number }>();
  flights.forEach((flight) => {
    const registration = flight.aircraft_registration?.trim().toUpperCase();
    if (!registration) return;
    const current = registrations.get(registration);
    if (current) current.count += 1;
    else registrations.set(registration, { flight, count: 1 });
  });
  return [...registrations.values()].sort((a, b) => b.count - a.count || (a.flight.aircraft_registration || '').localeCompare(b.flight.aircraft_registration || ''));
}

export function RouteDetailModal({ route, flights, colors, onClose, onOpenFlight }: {
  route: RouteSummary;
  flights: Flight[];
  colors: ThemeColors;
  onClose: () => void;
  onOpenFlight: (flight: Flight) => void;
}) {
  const chronological = [...flights].sort((a, b) => a.flight_date.localeCompare(b.flight_date));
  const latest = chronological[chronological.length - 1] || route.flight;
  const first = chronological[0] || route.flight;
  const aircraft = routeAircraft(flights);
  const models = [...new Set(flights.map((flight) => flight.aircraft_model?.trim()).filter((value): value is string => Boolean(value)))];
  const summary = routeSummaries(flights)[0] || route;
  const from = getAirport(latest.departure_airport_code);
  const to = getAirport(latest.arrival_airport_code);
  const routeDistance = Number(latest.distance_km) || routeDistanceKm(from, to) || 0;

  function openFlight(flight: Flight) {
    onClose();
    onOpenFlight(flight);
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={[styles.modalSafe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <View style={styles.modalHeader}><Pressable onPress={onClose} style={[styles.backButton, { backgroundColor: colors.surface }]} accessibilityLabel="Cerrar historia de la ruta"><Ionicons name="arrow-back" size={23} color={colors.ink} /></Pressable><Text style={[styles.modalHeaderTitle, { color: colors.ink }]}>Historia de la ruta</Text><View style={styles.headerSpacer} /></View>
          <View style={[styles.routeHero, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.routeHeroCodes, { color: colors.ink }]}>{latest.departure_airport_code} → {latest.arrival_airport_code}</Text>
            <Text style={[styles.routeHeroCities, { color: colors.muted }]}>{from?.city || latest.departure_airport_name || 'Origen'} → {to?.city || latest.arrival_airport_name || 'Destino'}</Text>
            <View style={styles.routeHeroMap}><FlightRouteMap flights={[latest]} colors={colors} height={210} focused /></View>
            <View style={styles.routeHeroStats}><View><Text style={[styles.routeHeroValue, { color: colors.ink }]}>{flights.length}</Text><Text style={[styles.routeHeroLabel, { color: colors.muted }]}>vuelos</Text></View><View><Text style={[styles.routeHeroValue, { color: colors.ink }]}>{Math.round(routeDistance).toLocaleString('es-ES')} km</Text><Text style={[styles.routeHeroLabel, { color: colors.muted }]}>por trayecto</Text></View><View><Text style={[styles.routeHeroValue, { color: colors.ink }]}>{aircraft.length}</Text><Text style={[styles.routeHeroLabel, { color: colors.muted }]}>aviones</Text></View></View>
          </View>

          <View style={styles.dateCards}><View style={[styles.dateCard, { backgroundColor: colors.surface, borderColor: colors.line }]}><Ionicons name="flag-outline" size={20} color={colors.primary} /><Text style={[styles.dateLabel, { color: colors.muted }]}>Primera vez</Text><Text style={[styles.dateValue, { color: colors.ink }]}>{shortDateLabel(first.flight_date)}</Text></View><View style={[styles.dateCard, { backgroundColor: colors.surface, borderColor: colors.line }]}><Ionicons name="time-outline" size={20} color={colors.primary} /><Text style={[styles.dateLabel, { color: colors.muted }]}>Última vez</Text><Text style={[styles.dateValue, { color: colors.ink }]}>{shortDateLabel(latest.flight_date)}</Text></View></View>

          <View style={[styles.routeDetailCard, { backgroundColor: colors.surface, borderColor: colors.line }]}><Text style={[styles.detailSectionTitle, { color: colors.ink }]}>Aerolíneas de esta ruta</Text><View style={[styles.modalDistribution, { backgroundColor: colors.input }]}>{summary.airlines.map((airline) => <View key={airline.label} style={{ flex: airline.count, backgroundColor: airline.color }} />)}</View><View style={styles.modalLegend}>{summary.airlines.map((airline) => <View key={airline.label} style={styles.airlineItem}><View style={[styles.airlineDot, { backgroundColor: airline.color }]} /><Text style={[styles.airlineText, { color: colors.muted }]}>{airline.label} · {airline.count}</Text></View>)}</View></View>

          <Text style={[styles.detailSectionTitle, { color: colors.ink, marginTop: 5 }]}>Aviones utilizados</Text>
          <Text style={[styles.detailSectionIntro, { color: colors.muted }]}>Una tarjeta por matrícula diferente. Toca la foto para abrirla.</Text>
          {aircraft.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.aircraftCarousel}>{aircraft.map(({ flight, count }) => <AircraftRegistrationCard key={flight.aircraft_registration} flight={flight} count={count} colors={colors} width={270} />)}</ScrollView> : <View style={[styles.noAircraft, { backgroundColor: colors.surface, borderColor: colors.line }]}><Ionicons name="camera-outline" size={27} color={colors.primary} /><Text style={[styles.noAircraftText, { color: colors.muted }]}>Añade las matrículas para ver fotografías de los aviones usados en esta ruta.</Text></View>}
          {models.length ? <View style={styles.modelChips}>{models.map((model) => <View key={model} style={[styles.modelChip, { backgroundColor: colors.primarySoft }]}><Ionicons name="airplane-outline" size={14} color={colors.primary} /><Text style={[styles.modelChipText, { color: colors.primary }]}>{model}</Text></View>)}</View> : null}

          <View style={[styles.routeDetailCard, { backgroundColor: colors.surface, borderColor: colors.line }]}><Text style={[styles.detailSectionTitle, { color: colors.ink }]}>Tus vuelos en esta ruta</Text>{[...chronological].reverse().map((flight, index) => <Pressable key={flight.id} onPress={() => openFlight(flight)} style={[styles.historyRow, index > 0 && { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth }]}><View style={styles.historyDate}><Text style={[styles.historyDateText, { color: colors.ink }]}>{shortDateLabel(flight.flight_date)}</Text><Text style={[styles.historyDirection, { color: colors.muted }]}>{flight.departure_airport_code} → {flight.arrival_airport_code}</Text></View><View style={styles.historyMeta}><Text numberOfLines={1} style={[styles.historyFlight, { color: colors.ink }]}>{flightNumberLabel(flight.flight_number)} · {flight.airline_name || 'Aerolínea pendiente'}</Text><Text numberOfLines={1} style={[styles.historyAircraft, { color: colors.muted }]}>{[flight.aircraft_model, flight.aircraft_registration].filter(Boolean).join(' · ') || 'Avión pendiente'}</Text></View><Ionicons name="chevron-forward" size={17} color={colors.muted} /></Pressable>)}</View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export function GlobalMapScreen({ flights, colors, onOpenFlight, onMapGestureActive }: {
  flights: Flight[];
  colors: ThemeColors;
  onOpenFlight: (flight: Flight) => void;
  onMapGestureActive?: (active: boolean) => void;
}) {
  const [filter, setFilter] = useState<MapFilter>('all');
  const [selectedRoute, setSelectedRoute] = useState<RouteSummary | null>(null);
  const [mapGestureActive, setMapGestureActive] = useState(false);
  const [showAllRoutes, setShowAllRoutes] = useState(false);
  const [showAllAirports, setShowAllAirports] = useState(false);
  const mappedFlights = useMemo(() => flightsWithMapCoordinates(flights), [flights]);
  const visibleFlights = useMemo(() => mappedFlights.filter((flight) => {
    if (filter === 'all') return true;
    return filter === 'flown' ? isFlown(flight) : !isFlown(flight);
  }), [filter, mappedFlights]);
  const routes = useMemo(() => routeSummaries(visibleFlights), [visibleFlights]);
  const airports = useMemo(() => {
    const values = new Map<string, number>();
    visibleFlights.flatMap((flight) => [flight.departure_airport_code, flight.arrival_airport_code]).forEach((code) => {
      if (code) values.set(code, (values.get(code) ?? 0) + 1);
    });
    return [...values].map(([code, count]) => ({ code, count, airport: getAirport(code) })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  }, [visibleFlights]);
  const distance = useMemo(() => visibleFlights.reduce((sum, flight) => {
    const stored = Number(flight.distance_km);
    if (stored > 0) return sum + stored;
    return sum + (routeDistanceKm(getAirport(flight.departure_airport_code), getAirport(flight.arrival_airport_code)) ?? 0);
  }, 0), [visibleFlights]);
  const withoutCoordinates = flights.length - mappedFlights.length;
  const selectedFlights = useMemo(() => selectedRoute ? mappedFlights.filter((flight) => routeKey(flight) === selectedRoute.key) : [], [mappedFlights, selectedRoute]);

  useEffect(() => () => onMapGestureActive?.(false), [onMapGestureActive]);

  function changeMapGesture(active: boolean) {
    setMapGestureActive(active);
    onMapGestureActive?.(active);
  }

  function openRouteForFlight(flight: Flight) {
    const key = routeKey(flight);
    const route = routes.find((item) => item.key === key) || routeSummaries(mappedFlights.filter((item) => routeKey(item) === key))[0];
    if (route) setSelectedRoute(route);
  }

  return (
    <ScrollView contentContainerStyle={styles.content} scrollEnabled={!mapGestureActive}>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>TU HUELLA EN EL MUNDO</Text>
      <Text style={[styles.title, { color: colors.ink }]}>Mapa de viajes</Text>
      <Text style={[styles.intro, { color: colors.muted }]}>Arrastra para moverte, pellizca para acercar y toca una ruta para abrir un vuelo. Los códigos de los aeropuertos aparecen al ampliar.</Text>

      <View style={[styles.mapCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <View style={styles.mapHeader}>
          <View style={styles.mapHeaderText}>
            <Text style={[styles.mapTitle, { color: colors.ink }]}>{visibleFlights.length} {visibleFlights.length === 1 ? 'vuelo visible' : 'vuelos visibles'}</Text>
            <Text style={[styles.mapSubtitle, { color: colors.muted }]}>{routes.length} {routes.length === 1 ? 'ruta' : 'rutas'} · {airports.length} aeropuertos</Text>
          </View>
          <View style={[styles.globeIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="earth-outline" size={23} color={colors.primary} /></View>
        </View>
        {visibleFlights.length ? (
          <View style={styles.mapClip}><FlightRouteMap flights={visibleFlights} colors={colors} height={235} interactive onSelectFlight={openRouteForFlight} onGestureActive={changeMapGesture} /></View>
        ) : (
          <View style={[styles.emptyMap, { backgroundColor: colors.sky }]}>
            <Ionicons name="map-outline" size={36} color={colors.primary} />
            <Text style={[styles.emptyTitle, { color: colors.ink }]}>No hay rutas para este filtro</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>Guarda los aeropuertos de salida y llegada para dibujarlas.</Text>
          </View>
        )}
      </View>

      <View style={[styles.filters, { backgroundColor: colors.input }]}>
        {([['all', 'Todos'], ['flown', 'Realizados'], ['planned', 'Previstos']] as Array<[MapFilter, string]>).map(([value, label]) => {
          const active = filter === value;
          return <Pressable key={value} onPress={() => setFilter(value)} style={[styles.filter, active && { backgroundColor: colors.surface }]}><Text style={[styles.filterText, { color: active ? colors.primary : colors.muted }]}>{label}</Text></Pressable>;
        })}
      </View>

      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.line }]}><Ionicons name="navigate-outline" size={20} color={colors.primary} /><Text style={[styles.summaryValue, { color: colors.ink }]}>{Math.round(distance).toLocaleString('es-ES')} km</Text><Text style={[styles.summaryLabel, { color: colors.muted }]}>recorridos</Text></View>
        <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.line }]}><Ionicons name="git-branch-outline" size={20} color={colors.primary} /><Text style={[styles.summaryValue, { color: colors.ink }]}>{routes.length}</Text><Text style={[styles.summaryLabel, { color: colors.muted }]}>rutas distintas</Text></View>
      </View>

      {routes.length ? <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}> 
        <Pressable onPress={() => setShowAllRoutes((current) => !current)} style={styles.sectionHeader} accessibilityRole="button" accessibilityLabel={showAllRoutes ? 'Mostrar menos rutas' : 'Mostrar todas las rutas'}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Rutas más frecuentes</Text>
          <View style={styles.sectionAction}><Text style={[styles.sectionActionText, { color: colors.primary }]}>{showAllRoutes ? 'Ver menos' : `Ver todas (${routes.length})`}</Text><Ionicons name={showAllRoutes ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} /></View>
        </Pressable>
        <Text style={[styles.sectionIntro, { color: colors.muted }]}>El color de cada tramo representa la proporción de vuelos por aerolínea.</Text>
        {routes.slice(0, showAllRoutes ? routes.length : 7).map((route, index) => (
          <Pressable key={route.key} onPress={() => setSelectedRoute(route)} style={[styles.routeRow, index > 0 && { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth }]} accessibilityRole="button" accessibilityLabel={`Abrir historia de la ruta ${route.label}`}>
            <View style={styles.routeMain}>
              <View style={styles.routeHeading}><Text style={[styles.routeLabel, { color: colors.ink }]}>{route.label}</Text><Text style={[styles.routeCount, { color: colors.primary }]}>{route.count}×</Text></View>
              <View style={[styles.distribution, { backgroundColor: colors.input }]}>{route.airlines.map((airline) => <View key={airline.label} style={{ flex: airline.count, backgroundColor: airline.color }} />)}</View>
              <View style={styles.airlineLegend}>{route.airlines.map((airline) => <View key={airline.label} style={styles.airlineItem}><View style={[styles.airlineDot, { backgroundColor: airline.color }]} /><Text style={[styles.airlineText, { color: colors.muted }]}>{airline.label} {airline.count}</Text></View>)}</View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
        ))}
      </View> : null}

      {airports.length ? <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}> 
        <Pressable onPress={() => setShowAllAirports((current) => !current)} style={styles.sectionHeader} accessibilityRole="button" accessibilityLabel={showAllAirports ? 'Mostrar menos aeropuertos' : 'Mostrar todos los aeropuertos'}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Aeropuertos más visitados</Text>
          <View style={styles.sectionAction}><Text style={[styles.sectionActionText, { color: colors.primary }]}>{showAllAirports ? 'Ver menos' : `Ver todos (${airports.length})`}</Text><Ionicons name={showAllAirports ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} /></View>
        </Pressable>
        {airports.slice(0, showAllAirports ? airports.length : 8).map((item, index) => <View key={item.code} style={[styles.airportRow, index > 0 && { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth }]}> 
          <Text style={styles.flag}>{countryFlag(item.airport?.countryCode)}</Text>
          <View style={styles.airportText}>
            <View style={styles.airportHeading}><Text style={[styles.airportCode, { color: colors.ink }]}>{item.code}</Text><Text numberOfLines={1} style={[styles.airportCity, { color: colors.ink }]}>{item.airport?.city || 'Ciudad sin indicar'}</Text></View>
            <Text numberOfLines={1} style={[styles.airportName, { color: colors.muted }]}>{item.airport?.name || 'Nombre del aeropuerto no disponible'}</Text>
          </View>
          <Text style={[styles.airportCount, { color: colors.primary }]}>{item.count}</Text>
        </View>)}
      </View> : null}

      {withoutCoordinates > 0 ? <View style={[styles.notice, { backgroundColor: colors.amber }]}><Ionicons name="information-circle-outline" size={20} color={colors.ink} /><Text style={[styles.noticeText, { color: colors.muted }]}>{withoutCoordinates === 1 ? 'Hay 1 vuelo que todavía no puede aparecer en el mapa.' : `Hay ${withoutCoordinates} vuelos que todavía no pueden aparecer en el mapa.`} Revisa sus códigos de aeropuerto.</Text></View> : null}
      {selectedRoute ? <RouteDetailModal route={selectedRoute} flights={selectedFlights} colors={colors} onClose={() => setSelectedRoute(null)} onOpenFlight={onOpenFlight} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 120 }, eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4 }, title: { fontSize: 33, fontWeight: '800', letterSpacing: -0.8, marginTop: 4 }, intro: { fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 20 },
  mapCard: { borderRadius: 25, borderWidth: 1, padding: 12, overflow: 'hidden' }, mapHeader: { padding: 6, paddingBottom: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, mapHeaderText: { flex: 1 }, mapTitle: { fontSize: 17, fontWeight: '700' }, mapSubtitle: { fontSize: 12, marginTop: 3 }, globeIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, mapClip: { borderRadius: 18, overflow: 'hidden' },
  emptyMap: { height: 235, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }, emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 10 }, emptyText: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 4 },
  filters: { marginTop: 12, padding: 4, borderRadius: 16, flexDirection: 'row' }, filter: { flex: 1, minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, filterText: { fontSize: 12, fontWeight: '700' },
  summaryRow: { flexDirection: 'row', gap: 10, marginTop: 12 }, summaryCard: { flex: 1, borderWidth: 1, borderRadius: 20, padding: 16 }, summaryValue: { fontSize: 18, fontWeight: '800', marginTop: 8 }, summaryLabel: { fontSize: 11, marginTop: 2 },
  card: { marginTop: 12, borderWidth: 1, borderRadius: 22, padding: 17 }, sectionHeader: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, sectionTitle: { flex: 1, fontSize: 18, fontWeight: '700' }, sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 3 }, sectionActionText: { fontSize: 10, fontWeight: '800' }, sectionIntro: { fontSize: 11, lineHeight: 16, marginTop: 4, marginBottom: 7 },
  routeRow: { minHeight: 85, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 }, routeMain: { flex: 1 }, routeHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, routeLabel: { fontSize: 15, fontWeight: '700' }, routeCount: { fontSize: 14, fontWeight: '800' }, distribution: { height: 7, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', marginTop: 8 }, airlineLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 7 }, airlineItem: { flexDirection: 'row', alignItems: 'center', gap: 4 }, airlineDot: { width: 7, height: 7, borderRadius: 4 }, airlineText: { fontSize: 10 },
  airportRow: { minHeight: 67, flexDirection: 'row', alignItems: 'center', gap: 11 }, flag: { fontSize: 22 }, airportText: { flex: 1 }, airportHeading: { flexDirection: 'row', alignItems: 'baseline', gap: 8 }, airportCode: { fontSize: 15, fontWeight: '800' }, airportCity: { flex: 1, fontSize: 13, fontWeight: '700' }, airportName: { fontSize: 10, marginTop: 3 }, airportCount: { fontSize: 15, fontWeight: '800' },
  notice: { borderRadius: 18, padding: 15, marginTop: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 9 }, noticeText: { flex: 1, fontSize: 12, lineHeight: 18 },
  modalSafe: { flex: 1 }, modalContent: { padding: 20, paddingBottom: 45 }, modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 17 }, backButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, modalHeaderTitle: { fontSize: 17, fontWeight: '700' }, headerSpacer: { width: 42 },
  routeHero: { borderWidth: 1, borderRadius: 25, padding: 12, overflow: 'hidden' }, routeHeroCodes: { fontSize: 27, fontWeight: '800', paddingHorizontal: 7, paddingTop: 5 }, routeHeroCities: { fontSize: 12, marginTop: 3, paddingHorizontal: 7 }, routeHeroMap: { borderRadius: 17, overflow: 'hidden', marginTop: 12 }, routeHeroStats: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 9, paddingTop: 15, paddingBottom: 6 }, routeHeroValue: { fontSize: 17, fontWeight: '800' }, routeHeroLabel: { fontSize: 9, marginTop: 2 },
  dateCards: { flexDirection: 'row', gap: 10, marginTop: 12 }, dateCard: { flex: 1, borderWidth: 1, borderRadius: 19, padding: 15 }, dateLabel: { fontSize: 10, marginTop: 8 }, dateValue: { fontSize: 15, fontWeight: '700', marginTop: 3 },
  routeDetailCard: { borderWidth: 1, borderRadius: 22, padding: 17, marginTop: 12 }, detailSectionTitle: { fontSize: 18, fontWeight: '700' }, detailSectionIntro: { fontSize: 11, lineHeight: 16, marginTop: 4, marginBottom: 11 }, modalDistribution: { height: 9, borderRadius: 6, overflow: 'hidden', flexDirection: 'row', marginTop: 14 }, modalLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  aircraftCarousel: { gap: 12, paddingRight: 20, paddingBottom: 5 }, noAircraft: { borderWidth: 1, borderRadius: 20, padding: 20, alignItems: 'center', gap: 8 }, noAircraftText: { fontSize: 11, lineHeight: 17, textAlign: 'center' }, modelChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 }, modelChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 11, paddingHorizontal: 9, paddingVertical: 7 }, modelChipText: { fontSize: 10, fontWeight: '700' },
  historyRow: { minHeight: 67, flexDirection: 'row', alignItems: 'center', gap: 10 }, historyDate: { width: 78 }, historyDateText: { fontSize: 11, fontWeight: '700' }, historyDirection: { fontSize: 10, marginTop: 3 }, historyMeta: { flex: 1 }, historyFlight: { fontSize: 12, fontWeight: '700' }, historyAircraft: { fontSize: 10, marginTop: 4 },
});
