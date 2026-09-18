import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { aircraftAppearance, airlineAppearance } from '../lib/flightVisuals';
import { Flight } from '../lib/flights';
import { ThemeColors } from '../theme';
import { AircraftPhotoFrame, AircraftRegistrationCard, loadAircraftPhoto } from './AircraftPhotoCard';

type CountItem = { label: string; count: number; color?: string };
type ModelGroup = { key: string; label: string; flights: Flight[] };

const previousModelCover = new Map<string, string>();

function modelFamily(model: string) {
  const value = model.trim().toUpperCase();
  const airbus = value.match(/\bA(220|300|310|318|319|320|321|330|340|350|380)(?:NEO)?\b/);
  if (airbus) return { key: `A${airbus[1]}`, label: `Airbus A${airbus[1]}` };
  const boeing = value.match(/\b(707|717|727|737|747|757|767|777|787)\b/);
  if (boeing) return { key: boeing[1], label: `Boeing ${boeing[1]}` };
  const embraer = value.match(/\bE(?:MB)?[- ]?(1[789]\d|2\d{2})\b/);
  if (embraer) return { key: `E${embraer[1]}`, label: `Embraer E${embraer[1]}` };
  const atr = value.match(/\bATR[- ]?(42|72)\b/);
  if (atr) return { key: `ATR${atr[1]}`, label: `ATR ${atr[1]}` };
  return { key: value, label: model.trim() };
}

function groupModels(flights: Flight[]): ModelGroup[] {
  const groups = new Map<string, ModelGroup>();
  flights.forEach((flight) => {
    if (!flight.aircraft_model?.trim()) return;
    const family = modelFamily(flight.aircraft_model);
    const group = groups.get(family.key);
    if (group) group.flights.push(flight);
    else groups.set(family.key, { key: family.key, label: family.label, flights: [flight] });
  });
  return [...groups.values()].sort((a, b) => b.flights.length - a.flights.length || a.label.localeCompare(b.label));
}

function countValues(values: Array<{ label?: string | null; color?: string }>): CountItem[] {
  const counts = new Map<string, CountItem>();
  values.forEach(({ label, color }) => {
    const value = label?.trim();
    if (!value) return;
    const current = counts.get(value);
    if (current) current.count += 1;
    else counts.set(value, { label: value, count: 1, color });
  });
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function uniqueRegistrations(flights: Flight[]) {
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

function ModelGallery({ group, colors, onClose }: { group: ModelGroup; colors: ThemeColors; onClose: () => void }) {
  const registrations = uniqueRegistrations(group.flights);
  const registrationKey = registrations.map(({ flight, count }) => `${flight.aircraft_registration}:${count}`).join('|');
  const [orderedRegistrations, setOrderedRegistrations] = useState<Array<{ flight: Flight; count: number }> | null>(null);
  const appearance = aircraftAppearance(group.label);
  const withoutRegistration = group.flights.length - group.flights.filter((flight) => flight.aircraft_registration).length;

  useEffect(() => {
    let active = true;
    setOrderedRegistrations(null);
    Promise.all(registrations.map(async (item) => ({
      item,
      hasPhoto: Boolean(await loadAircraftPhoto(item.flight.aircraft_registration || '')),
    }))).then((results) => {
      if (!active) return;
      setOrderedRegistrations(results
        .sort((a, b) => Number(b.hasPhoto) - Number(a.hasPhoto) || b.item.count - a.item.count || (a.item.flight.aircraft_registration || '').localeCompare(b.item.flight.aircraft_registration || ''))
        .map(({ item }) => item));
    });
    return () => { active = false; };
  }, [group.key, registrationKey]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={[styles.modalSafe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <View style={styles.modalHeader}><Pressable onPress={onClose} style={[styles.backButton, { backgroundColor: colors.surface }]} accessibilityLabel="Volver a aviones"><Ionicons name="arrow-back" size={23} color={colors.ink} /></Pressable><Text style={[styles.modalHeaderTitle, { color: colors.ink }]}>Galería del modelo</Text><View style={styles.headerSpacer} /></View>
          <View style={[styles.modelHero, { backgroundColor: appearance.background }]}><Ionicons name="airplane" size={42} color={appearance.color} /><View style={styles.modelHeroText}><Text style={[styles.modelHeroTitle, { color: colors.ink }]}>{group.label}</Text><Text style={[styles.modelHeroMeta, { color: colors.muted }]}>{group.flights.length} {group.flights.length === 1 ? 'vuelo' : 'vuelos'} · {registrations.length} {registrations.length === 1 ? 'avión identificado' : 'aviones identificados'}</Text></View></View>
          <Text style={[styles.galleryHeading, { color: colors.ink }]}>Los aviones en los que has volado</Text>
          <Text style={[styles.galleryDescription, { color: colors.muted }]}>Cada tarjeta corresponde a una matrícula diferente. Toca una fotografía para abrir su publicación original.</Text>
          {registrations.length ? orderedRegistrations ? <View style={styles.registrationGallery}>{orderedRegistrations.map(({ flight, count }) => <AircraftRegistrationCard key={flight.aircraft_registration} flight={flight} count={count} colors={colors} />)}</View> : <View style={[styles.photoLoading, { backgroundColor: colors.surface, borderColor: colors.line }]}><ActivityIndicator color={colors.primary} /><Text style={[styles.emptyGalleryText, { color: colors.muted }]}>Ordenando primero los aviones con fotografía…</Text></View> : <View style={[styles.emptyGallery, { backgroundColor: colors.surface, borderColor: colors.line }]}><Ionicons name="camera-outline" size={30} color={colors.primary} /><Text style={[styles.emptyGalleryTitle, { color: colors.ink }]}>Faltan las matrículas</Text><Text style={[styles.emptyGalleryText, { color: colors.muted }]}>Añádelas a tus vuelos para construir esta galería.</Text></View>}
          {withoutRegistration > 0 ? <Text style={[styles.missingRegistration, { color: colors.muted }]}>{withoutRegistration} {withoutRegistration === 1 ? 'vuelo de este modelo no tiene matrícula guardada.' : 'vuelos de este modelo no tienen matrícula guardada.'}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function ModelCard({ group, colors, onPress, active }: { group: ModelGroup; colors: ThemeColors; onPress: () => void; active: boolean }) {
  const registrations = uniqueRegistrations(group.flights);
  const registrationKey = registrations.map(({ flight, count }) => `${flight.aircraft_registration}:${count}`).join('|');
  const appearance = aircraftAppearance(group.label);
  const [representative, setRepresentative] = useState<Flight | null>(null);

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    setRepresentative(null);
    Promise.all(registrations.map(async (item) => ({
      item,
      hasPhoto: Boolean(await loadAircraftPhoto(item.flight.aircraft_registration || '')),
    }))).then((results) => {
      if (!mounted) return;
      const photographed = results.filter((result) => result.hasPhoto).map(({ item }) => item);
      const candidates = photographed.length ? photographed : registrations;
      const previous = previousModelCover.get(group.key);
      const fresh = candidates.filter(({ flight }) => flight.aircraft_registration?.trim().toUpperCase() !== previous);
      const pool = fresh.length ? fresh : candidates;
      const selected = pool[Math.floor(Math.random() * pool.length)]?.flight || group.flights[0];
      if (selected.aircraft_registration && photographed.length) previousModelCover.set(group.key, selected.aircraft_registration.trim().toUpperCase());
      setRepresentative(selected);
    });
    return () => { mounted = false; };
  }, [active, group.key, registrationKey]);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.modelCard, { backgroundColor: colors.surface, borderColor: colors.line }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Abrir galería de ${group.label}`}>
      {representative ? <AircraftPhotoFrame registration={representative.aircraft_registration} model={group.label} colors={colors} height={150} /> : <View style={[styles.modelPhotoLoading, { backgroundColor: appearance.background }]}><ActivityIndicator color={appearance.color} /></View>}
      <View style={styles.modelCardBody}>
        <View style={styles.modelCardHeading}><View style={styles.modelCardTitleWrap}><Text style={[styles.modelCardTitle, { color: colors.ink }]}>{group.label}</Text><Text style={[styles.modelCardMeta, { color: colors.muted }]}>{group.flights.length} {group.flights.length === 1 ? 'vuelo' : 'vuelos'} · {registrations.length} {registrations.length === 1 ? 'matrícula' : 'matrículas'}</Text></View><View style={[styles.modelCount, { backgroundColor: colors.primarySoft }]}><Text style={[styles.modelCountText, { color: colors.primary }]}>{group.flights.length}×</Text></View></View>
        <View style={[styles.openGallery, { backgroundColor: colors.input }]}><Ionicons name="images-outline" size={17} color={colors.primary} /><Text style={[styles.openGalleryText, { color: colors.primary }]}>Ver los aviones de este modelo</Text><Ionicons name="chevron-forward" size={17} color={colors.primary} /></View>
      </View>
    </Pressable>
  );
}

function Ranking({ title, items, empty, colors }: { title: string; items: CountItem[]; empty: string; colors: ThemeColors }) {
  const max = items[0]?.count || 1;
  return <View style={[styles.rankingCard, { backgroundColor: colors.surface, borderColor: colors.line }]}><Text style={[styles.sectionTitle, { color: colors.ink }]}>{title}</Text>{items.length ? items.slice(0, 7).map((item) => <View key={item.label} style={styles.barItem}><View style={styles.barHeading}><Text numberOfLines={1} style={[styles.barLabel, { color: colors.ink }]}>{item.label}</Text><Text style={[styles.barCount, { color: colors.muted }]}>{item.count}</Text></View><View style={[styles.barTrack, { backgroundColor: colors.input }]}><View style={[styles.barFill, { width: `${Math.max(8, item.count / max * 100)}%`, backgroundColor: item.color || colors.primary }]} /></View></View>) : <Text style={[styles.empty, { color: colors.muted }]}>{empty}</Text>}</View>;
}

export function AircraftScreen({ flights, colors, active = true }: { flights: Flight[]; colors: ThemeColors; active?: boolean }) {
  const [selectedModel, setSelectedModel] = useState<ModelGroup | null>(null);
  const modelGroups = useMemo(() => groupModels(flights), [flights]);
  const airlines = useMemo(() => countValues(flights.map((flight) => ({ label: flight.airline_name || flight.flight_number?.match(/^[A-Z]+/)?.[0], color: airlineAppearance(flight.flight_number, flight.airline_name).background }))), [flights]);
  const manufacturers = useMemo(() => countValues(flights.map((flight) => ({ label: flight.aircraft_model ? aircraftAppearance(flight.aircraft_model).manufacturer : null, color: aircraftAppearance(flight.aircraft_model).color }))), [flights]);
  const registrations = useMemo(() => new Set(flights.map((flight) => flight.aircraft_registration?.trim().toUpperCase()).filter(Boolean)).size, [flights]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>A BORDO</Text><Text style={[styles.title, { color: colors.ink }]}>Aviones</Text><Text style={[styles.intro, { color: colors.muted }]}>Toca un modelo para descubrir cada avión diferente en el que has volado.</Text>
      <Text style={[styles.modelsTitle, { color: colors.ink }]}>Tus modelos más usados</Text>
      {modelGroups.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modelCarousel}>{modelGroups.map((group) => <ModelCard key={group.key} group={group} colors={colors} active={active} onPress={() => setSelectedModel(group)} />)}</ScrollView> : <View style={[styles.emptyModels, { backgroundColor: colors.surface, borderColor: colors.line }]}><Ionicons name="airplane-outline" size={30} color={colors.primary} /><Text style={[styles.emptyGalleryTitle, { color: colors.ink }]}>Aún no hay modelos</Text><Text style={[styles.emptyGalleryText, { color: colors.muted }]}>Añade el modelo a un vuelo y aparecerá aquí con su galería.</Text></View>}
      <View style={[styles.hero, { backgroundColor: colors.sky }]}><View style={[styles.heroIcon, { backgroundColor: colors.surface }]}><Ionicons name="airplane" size={28} color={colors.primary} /></View><View style={styles.heroStats}><View><Text style={[styles.heroValue, { color: colors.ink }]}>{registrations}</Text><Text style={[styles.heroLabel, { color: colors.muted }]}>matrículas</Text></View><View><Text style={[styles.heroValue, { color: colors.ink }]}>{modelGroups.length}</Text><Text style={[styles.heroLabel, { color: colors.muted }]}>modelos</Text></View><View><Text style={[styles.heroValue, { color: colors.ink }]}>{airlines.length}</Text><Text style={[styles.heroLabel, { color: colors.muted }]}>aerolíneas</Text></View></View></View>
      <Ranking title="Aerolíneas más usadas" items={airlines} empty="Añade la aerolínea a tus vuelos." colors={colors} />
      <Ranking title="Fabricantes" items={manufacturers} empty="Añade el modelo del avión para calcularlo." colors={colors} />
      <Text style={[styles.photoNotice, { color: colors.muted }]}>Las fotografías corresponden a la matrícula guardada, conservan el crédito y enlazan a la publicación original. Pueden haberse tomado en otra fecha o con otra librea.</Text>
      {selectedModel ? <ModelGallery group={selectedModel} colors={colors} onClose={() => setSelectedModel(null)} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 120 }, eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }, title: { fontSize: 33, fontWeight: '800', letterSpacing: -0.8, marginTop: 4 }, intro: { fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 18 }, modelsTitle: { fontSize: 20, fontWeight: '700', marginBottom: 11 },
  modelCarousel: { gap: 12, paddingRight: 20, paddingBottom: 18 }, modelCard: { width: 278, borderWidth: 1, borderRadius: 23, overflow: 'hidden' }, pressed: { opacity: .72 }, modelCardBody: { padding: 15 }, modelCardHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 }, modelCardTitleWrap: { flex: 1 }, modelCardTitle: { fontSize: 19, fontWeight: '800' }, modelCardMeta: { fontSize: 10, marginTop: 3 }, modelCount: { borderRadius: 11, paddingHorizontal: 8, paddingVertical: 6 }, modelCountText: { fontSize: 11, fontWeight: '800' }, openGallery: { minHeight: 41, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, marginTop: 13 }, openGalleryText: { flex: 1, fontSize: 11, fontWeight: '800' },
  emptyModels: { borderWidth: 1, borderRadius: 22, padding: 24, alignItems: 'center', marginBottom: 18 }, modelPhotoLoading: { height: 150, alignItems: 'center', justifyContent: 'center' }, hero: { borderRadius: 24, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 17, marginBottom: 14 }, heroIcon: { width: 55, height: 55, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, heroStats: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' }, heroValue: { fontSize: 22, fontWeight: '800' }, heroLabel: { fontSize: 10, marginTop: 2 },
  rankingCard: { borderWidth: 1, borderRadius: 22, padding: 18, marginBottom: 13 }, sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 15 }, barItem: { marginBottom: 13 }, barHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, barLabel: { flex: 1, fontSize: 13, fontWeight: '600' }, barCount: { fontSize: 12, fontWeight: '700' }, barTrack: { height: 8, borderRadius: 5, overflow: 'hidden', marginTop: 7 }, barFill: { height: '100%', borderRadius: 5 }, empty: { fontSize: 13, lineHeight: 19 }, photoNotice: { fontSize: 10, lineHeight: 15, textAlign: 'center', paddingHorizontal: 12, marginTop: 2 },
  modalSafe: { flex: 1 }, modalContent: { padding: 20, paddingBottom: 45 }, modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 17 }, backButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, modalHeaderTitle: { fontSize: 17, fontWeight: '700' }, headerSpacer: { width: 42 }, modelHero: { borderRadius: 24, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 22 }, modelHeroText: { flex: 1 }, modelHeroTitle: { fontSize: 25, fontWeight: '800' }, modelHeroMeta: { fontSize: 11, lineHeight: 16, marginTop: 4 }, galleryHeading: { fontSize: 20, fontWeight: '700' }, galleryDescription: { fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 14 }, registrationGallery: { gap: 13 }, photoLoading: { minHeight: 130, borderWidth: 1, borderRadius: 22, padding: 22, alignItems: 'center', justifyContent: 'center', gap: 10 }, emptyGallery: { borderWidth: 1, borderRadius: 22, padding: 25, alignItems: 'center' }, emptyGalleryTitle: { fontSize: 16, fontWeight: '700', marginTop: 9 }, emptyGalleryText: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 4 }, missingRegistration: { fontSize: 11, lineHeight: 17, marginTop: 14, textAlign: 'center' },
});
