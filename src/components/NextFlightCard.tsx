import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { airportPlace, flightDepartureDate, formatInTimeZone, getAirport } from '../lib/airports';
import { airlineAppearance } from '../lib/flightVisuals';
import { Flight, flightNumberLabel } from '../lib/flights';
import { ThemeColors } from '../theme';

function countdown(target: Date | null) {
  if (!target) return 'Próximamente';
  const minutes = Math.max(0, Math.floor((target.getTime() - Date.now()) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `En ${days} ${days === 1 ? 'día' : 'días'} y ${hours} h`;
  if (hours > 0) return `En ${hours} h ${minutes % 60} min`;
  return `En ${Math.max(1, minutes)} min`;
}

export function NextFlightCard({ flight, colors, onPress }: {
  flight: Flight; colors: ThemeColors;
  onPress: () => void;
}) {
  const [, setClock] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setClock((value) => value + 1), 60_000);
    return () => clearInterval(interval);
  }, []);
  const departure = flightDepartureDate(flight);
  const from = getAirport(flight.departure_airport_code);
  const to = getAirport(flight.arrival_airport_code);
  const airline = airlineAppearance(flight.flight_number, flight.airline_name);

  return (
    <Pressable onPress={onPress} style={[styles.card, { backgroundColor: colors.surface, borderColor: airline.background }]}>
      <View style={styles.top}>
        <View><Text style={[styles.eyebrow, { color: colors.primary }]}>PRÓXIMO VUELO</Text><Text style={[styles.countdown, { color: colors.ink }]}>{countdown(departure)}</Text></View>
        <View style={[styles.code, { backgroundColor: airline.background }]}><Text style={[styles.codeText, { color: airline.text }]}>{flightNumberLabel(flight.flight_number)}</Text></View>
      </View>
      <View style={styles.route}>
        <View style={styles.endpoint}><Text style={[styles.airportCode, { color: colors.ink }]}>{flight.departure_airport_code || '---'}</Text><Text numberOfLines={1} style={[styles.city, { color: colors.muted }]}>{airportPlace(from, flight.departure_airport_name)}</Text></View>
        <View style={styles.path}><View style={[styles.line, { backgroundColor: colors.routeLine }]} /><Ionicons name="airplane" size={20} color={airline.background} /><View style={[styles.line, { backgroundColor: colors.routeLine }]} /></View>
        <View style={[styles.endpoint, styles.endpointRight]}><Text style={[styles.airportCode, { color: colors.ink }]}>{flight.arrival_airport_code || '---'}</Text><Text numberOfLines={1} style={[styles.city, { color: colors.muted }]}>{airportPlace(to, flight.arrival_airport_name)}</Text></View>
      </View>
      <View style={[styles.info, { backgroundColor: colors.input }]}>
        <View style={styles.infoItem}><Ionicons name="time-outline" size={16} color={colors.primary} /><Text style={[styles.infoText, { color: colors.ink }]}>{flight.departure_time_local?.slice(0, 5) || 'Hora pendiente'}</Text></View>
        {from?.timeZone ? <Text style={[styles.localTime, { color: colors.muted }]}>Ahora en origen: {formatInTimeZone(new Date(), from.timeZone)}</Text> : null}
      </View>
      <View style={styles.bottom}>
        <Text numberOfLines={1} style={[styles.bottomText, { color: colors.muted }]}>{[flight.seat ? `Asiento ${flight.seat}` : null, flight.aircraft_model].filter(Boolean).join(' · ') || 'Toca para ver los detalles'}</Text>
        <View style={[styles.openButton, { backgroundColor: colors.primarySoft }]}><Ionicons name="chevron-forward" size={18} color={colors.primary} /></View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 25, borderWidth: 1.5, padding: 19, marginBottom: 14 }, top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4 }, countdown: { fontSize: 21, fontWeight: '800', marginTop: 4 }, code: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 }, codeText: { fontSize: 13, fontWeight: '800' },
  route: { flexDirection: 'row', alignItems: 'center', marginTop: 23, marginBottom: 16 }, endpoint: { width: 82 }, endpointRight: { alignItems: 'flex-end' }, airportCode: { fontSize: 26, fontWeight: '800' }, city: { fontSize: 10, marginTop: 2, maxWidth: 82 }, path: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }, line: { height: 1, flex: 1 },
  info: { minHeight: 43, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, gap: 8 }, infoItem: { flexDirection: 'row', alignItems: 'center', gap: 6 }, infoText: { fontSize: 13, fontWeight: '700' }, localTime: { fontSize: 10 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }, bottomText: { flex: 1, fontSize: 11 }, openButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
