import { AircraftModelPicker } from './src/components/AircraftModelPicker';
import { FlighteraProbe } from './src/components/FlighteraProbe';
import {
  isRecentPlaneFinderDate,
  PlaneFinderProbe,
} from './src/components/PlaneFinderProbe';
import DateTimePicker from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Session } from '@supabase/supabase-js';
import Storage from 'expo-sqlite/kv-store';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, BackHandler, Easing, KeyboardAvoidingView, PanResponder, Platform, Pressable,
  ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import {
  actualScheduleSource, applyActualScheduleToDraft, blankDraft, dateLabel,
  draftToRow, Flight, FlightDraft, flightNumberLabel, flightToDraft,
  formatDuration, localDateKey, shortDateLabel, validateDraft,
} from './src/lib/flights';
import { isConfigured, supabase } from './src/lib/supabase';
import { applySuggestion, canLookup, lookupFlight, LookupSuggestion, normalizedFlightNumber } from './src/lib/lookup';
import { aircraftAppearance, airlineAppearance } from './src/lib/flightVisuals';
import { FlightDetailScreen } from './src/components/FlightDetailScreen';
import { NextFlightCard } from './src/components/NextFlightCard';
import { GlobalMapScreen } from './src/components/GlobalMapScreen';
import { AircraftScreen } from './src/components/AircraftScreen';
import { calculatedArrival, flightDepartureDate, getAirport, localDateTimeParts, routeDistanceKm } from './src/lib/airports';
import { darkColors, lightColors, ThemeColors } from './src/theme';

type Page = 'list' | 'detail' | 'edit' | 'map' | 'aircraft' | 'settings';
type TabPage = 'list' | 'map' | 'aircraft' | 'settings';
type SortOrder = 'newest' | 'oldest';
const tabPages: TabPage[] = ['list', 'map', 'aircraft', 'settings'];
const calculatedArrivalSource = 'Calculado: salida + duración';

function isTabPage(page: Page): page is TabPage {
  return tabPages.includes(page as TabPage);
}

function draftWithCalculatedArrival(draft: FlightDraft): FlightDraft {
  if (draft.arrivalTime) return draft;
  const arrival = calculatedArrival(
    localDateKey(draft.flightDate),
    draft.departureTime,
    draft.durationMinutes,
    draft.departureCode,
    draft.arrivalCode,
  );
  if (!arrival) return draft;
  return {
    ...draft,
    arrivalTime: arrival.time,
    arrivalDate: draft.arrivalDate || arrival.date,
    fieldSources: {
      ...draft.fieldSources,
      arrivalTime: calculatedArrivalSource,
      ...(!draft.arrivalDate ? { arrivalDate: calculatedArrivalSource } : {}),
    },
  };
}

function flightWithCalculatedArrival(flight: Flight) {
  if (flight.arrival_time_local || flight.duration_minutes == null) return null;
  const departureAirport = getAirport(flight.departure_airport_code);
  const scheduledDeparture = localDateTimeParts(
    flight.scheduled_departure_at,
    departureAirport?.timeZone,
  );
  const departureTime = flight.departure_time_local?.slice(0, 5) || scheduledDeparture?.time || '';
  const departureDate = scheduledDeparture?.date || flight.flight_date;
  const arrival = calculatedArrival(
    departureDate,
    departureTime,
    flight.duration_minutes,
    flight.departure_airport_code || '',
    flight.arrival_airport_code || '',
  );
  if (!arrival) return null;
  const fieldSources = {
    ...(flight.field_sources ?? {}),
    arrivalTime: calculatedArrivalSource,
    ...(!flight.arrival_date ? { arrivalDate: calculatedArrivalSource } : {}),
  };
  const arrivalDate = flight.arrival_date || arrival.date;
  return {
    flight: {
      ...flight,
      arrival_time_local: arrival.time,
      arrival_date: arrivalDate,
      field_sources: fieldSources,
    },
    patch: {
      arrival_time_local: arrival.time,
      arrival_date: arrivalDate,
      field_sources: fieldSources,
    },
  };
}

let colors: ThemeColors = lightColors;
let styles = createStyles(colors);

function effectiveFlightStatus(
  flight: Flight,
): 'flown' | 'planned' {
  const today = localDateKey(new Date());

  if (flight.flight_date < today) {
    return 'flown';
  }

  if (flight.flight_date > today) {
    return 'planned';
  }

  return flight.actual_arrival_at
    ? 'flown'
    : 'planned';
}

function draftAutomaticStatus(
  date: Date,
  actualArrivalAt?: string,
): 'flown' | 'planned' {
  const selected = localDateKey(date);
  const today = localDateKey(new Date());

  if (selected < today) {
    return 'flown';
  }

  if (selected > today) {
    return 'planned';
  }

  return actualArrivalAt
    ? 'flown'
    : 'planned';
}


function ActionButton({ label, onPress, secondary = false, disabled = false, icon }: {
  label: string; onPress: () => void; secondary?: boolean; disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, (disabled || pressed) && styles.buttonDimmed]}
    >
      {icon && <Ionicons name={icon} size={19} color={secondary ? colors.primary : colors.onPrimary} />}
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

function InputField({ label, value, onChangeText, placeholder, autoCapitalize, keyboardType, multiline, hint, maxLength, secureTextEntry, onToggleSecureTextEntry }: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'numeric' | 'email-address'; multiline?: boolean;
  hint?: string; maxLength?: number; secureTextEntry?: boolean;
  onToggleSecureTextEntry?: () => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputContainer}>
        <TextInput
          style={[
            styles.input,
            multiline && styles.inputMultiline,
            onToggleSecureTextEntry && styles.inputWithAccessory,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          autoCapitalize={autoCapitalize ?? 'sentences'}
          autoCorrect={false}
          keyboardType={keyboardType ?? 'default'}
          multiline={multiline}
          maxLength={maxLength}
          secureTextEntry={secureTextEntry}
        />
        {onToggleSecureTextEntry && (
          <Pressable
            onPress={onToggleSecureTextEntry}
            accessibilityRole="button"
            accessibilityLabel={secureTextEntry ? 'Mostrar contraseña' : 'Ocultar contraseña'}
            hitSlop={10}
            style={styles.inputAccessory}
          >
            <Ionicons
              name={secureTextEntry ? 'eye-outline' : 'eye-off-outline'}
              size={22}
              color={colors.muted}
            />
          </Pressable>
        )}
      </View>
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

function SetupScreen() {
  return (
    <View style={styles.centered}>
      <View style={styles.logo}><Ionicons name="airplane" size={29} color={colors.primary} /></View>
      <Text style={styles.bigTitle}>FlightLog</Text>
      <Text style={styles.subtitle}>Tu diario de vuelos está listo para conectar con tu cuenta.</Text>
      <View style={styles.noticeCard}>
        <Text style={styles.noticeTitle}>Falta conectar el espacio de datos</Text>
        <Text style={styles.body}>Completa el archivo .env con la URL y la clave pública del proyecto. Después reinicia la aplicación.</Text>
      </View>
    </View>
  );
}

function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  async function submit() {
    if (!supabase) return;
    if (!email.trim() || !password) {
      Alert.alert('Faltan datos', 'Escribe tu correo y contraseña.');
      return;
    }
    if (mode === 'signup' && password.length < 6) {
      Alert.alert('Contraseña muy corta', 'Usa al menos 6 caracteres.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) Alert.alert('No se pudo entrar', error.message);
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) Alert.alert('No se pudo crear la cuenta', error.message);
        else if (!data.session) Alert.alert('Revisa tu correo', 'Confirma tu dirección con el enlace recibido y vuelve para entrar.');
      }
    } catch {
      Alert.alert('Sin conexión', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}><Ionicons name="airplane" size={29} color={colors.primary} /></View>
        <Text style={styles.bigTitle}>FlightLog</Text>
        <Text style={styles.subtitle}>Cada vuelo tiene una historia. Guarda la tuya aquí.</Text>
        <View style={[styles.card, styles.authCard]}>
          <Text style={styles.sectionTitle}>{mode === 'login' ? 'Qué bueno verte' : 'Empieza tu diario'}</Text>
          <InputField label="Correo electrónico" value={email} onChangeText={setEmail} placeholder="tu@email.com" autoCapitalize="none" keyboardType="email-address" />
          <InputField
            label="Contraseña"
            value={password}
            onChangeText={setPassword}
            placeholder="Al menos 6 caracteres"
            autoCapitalize="none"
            secureTextEntry={!passwordVisible}
            onToggleSecureTextEntry={() => setPasswordVisible((current) => !current)}
          />
          <ActionButton label={busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'} onPress={submit} disabled={busy} />
          <Pressable onPress={() => setMode(mode === 'login' ? 'signup' : 'login')} style={styles.switchAuth}>
            <Text style={styles.linkText}>{mode === 'login' ? '¿Aún no tienes cuenta? Crear una' : 'Ya tengo cuenta'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FlightCard({
  flight,
  onPress,
  onLongPress,
}: {
  flight: Flight;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const route = [flight.departure_airport_code, flight.arrival_airport_code];
  const status = effectiveFlightStatus(flight);
  const hasRoute = route.every(Boolean);
  const airline = airlineAppearance(flight.flight_number, flight.airline_name);
  const aircraft = aircraftAppearance(flight.aircraft_model);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={550} style={({ pressed }) => [styles.flightCard, pressed && styles.buttonDimmed]} accessibilityRole="button">
      <View style={styles.flightTop}>
        <View style={styles.flightIdentity}>
          <View style={[styles.flightNumberPill, { backgroundColor: airline.background }]}>
            <Text style={[styles.flightNumberText, { color: airline.text }]}>{flightNumberLabel(flight.flight_number)}</Text>
          </View>
          <View style={[styles.aircraftIcon, { backgroundColor: aircraft.background }]}>
            <Ionicons name="airplane" size={aircraft.iconSize} color={aircraft.color} />
          </View>
        </View>
        <Text style={styles.flightDate}>{shortDateLabel(flight.flight_date)}</Text>
      </View>
      <View style={styles.routeRow}>
        <Text style={styles.routeCode}>{hasRoute ? route[0] : 'Salida'}</Text>
        <View style={styles.routeLine}><View style={styles.dot} /><View style={styles.line} /><Ionicons name="airplane" size={17} color={colors.primary} /><View style={styles.line} /><View style={styles.dot} /></View>
        <Text style={styles.routeCode}>{hasRoute ? route[1] : 'Llegada'}</Text>
      </View>
      <View style={styles.flightBottom}>
        <View style={styles.flightDetails}>
          <Text style={styles.flightMeta}>{flight.airline_name || (hasRoute ? 'Vuelo guardado' : 'Añade la ruta cuando quieras')}</Text>
          {flight.aircraft_model ? <Text style={[styles.aircraftMeta, { color: aircraft.color }]}>{aircraft.manufacturer} · {aircraft.sizeLabel}</Text> : null}
        </View>
        <View style={[styles.statusPill, status === 'planned' ? styles.statusPlanned : styles.statusFlown]}>
          <Text style={[styles.statusText, status === 'planned' ? styles.statusTextPlanned : styles.statusTextFlown]}>{status === 'planned' ? 'Previsto' : 'Realizado'}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function ListScreen({ flights, loading, sortOrder, onToggleSort, onRefresh, onOpenDetail, onDelete }: {
  flights: Flight[]; loading: boolean; onRefresh: () => void;
  sortOrder: SortOrder; onToggleSort: () => void;
  onOpenDetail: (flight: Flight) => void;
  onDelete: (flight: Flight) => void;
}) {
  const completed = flights.filter((flight) => effectiveFlightStatus(flight) === 'flown');
  const minutes = completed.reduce((sum, flight) => sum + (flight.duration_minutes ?? 0), 0);
  const distance = completed.reduce((sum, flight) => sum + (Number(flight.distance_km) || routeDistanceKm(getAirport(flight.departure_airport_code), getAirport(flight.arrival_airport_code)) || 0), 0);
  const airportCount = new Set(flights.flatMap((flight) => [flight.departure_airport_code, flight.arrival_airport_code]).filter(Boolean)).size;
  const sortedFlights = useMemo(() => [...flights].sort((a, b) => {
    const dateComparison = a.flight_date.localeCompare(b.flight_date);
    if (dateComparison !== 0) return sortOrder === 'oldest' ? dateComparison : -dateComparison;
    return sortOrder === 'oldest'
      ? a.created_at.localeCompare(b.created_at)
      : b.created_at.localeCompare(a.created_at);
  }), [flights, sortOrder]);
  const nextFlight = useMemo(() => flights
    .map((flight) => ({ flight, departure: flightDepartureDate(flight) }))
    .filter((item): item is { flight: Flight; departure: Date } => Boolean(item.departure && item.departure.getTime() > Date.now()))
    .sort((a, b) => a.departure.getTime() - b.departure.getTime())[0]?.flight ?? null, [flights]);
  
  function confirmListDelete(
    flight: Flight,
  ) {
    Alert.alert(
      'Eliminar vuelo',
      `Se eliminará ${flightNumberLabel(flight.flight_number)}. Esta acción no se puede deshacer.`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () =>
            onDelete(flight),
        },
      ],
    );
  }

return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.listContent}>
        <View style={styles.headerRow}>
          <View><Text style={styles.eyebrow}>MI DIARIO DE VIAJE</Text><Text style={styles.bigTitle}>Tus vuelos</Text></View>
        </View>
        <View style={styles.journeySummary}>
          <View style={styles.journeySummaryTop}><Text style={styles.journeySummaryTitle}>Tu resumen</Text><Text style={styles.journeySummaryMeta}>{completed.length} realizados · {flights.length - completed.length} previstos</Text></View>
          <View style={styles.journeySummaryGrid}>
            <View style={styles.journeyMetric}><Text style={styles.journeyMetricValue}>{flights.length}</Text><Text style={styles.journeyMetricLabel}>vuelos</Text></View>
            <View style={styles.journeyMetric}><Text style={styles.journeyMetricValue}>{formatDuration(minutes) || '0 min'}</Text><Text style={styles.journeyMetricLabel}>en el aire</Text></View>
            <View style={styles.journeyMetric}><Text style={styles.journeyMetricValue}>{Math.round(distance).toLocaleString('es-ES')}</Text><Text style={styles.journeyMetricLabel}>kilómetros</Text></View>
            <View style={styles.journeyMetric}><Text style={styles.journeyMetricValue}>{airportCount}</Text><Text style={styles.journeyMetricLabel}>aeropuertos</Text></View>
          </View>
        </View>
        {nextFlight ? <NextFlightCard flight={nextFlight} colors={colors} onPress={() => onOpenDetail(nextFlight)} /> : null}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Todos los vuelos</Text>
          <View style={styles.listActions}>
            <Pressable onPress={onToggleSort} style={styles.sortButton} accessibilityLabel="Cambiar orden de los vuelos">
              <Ionicons name={sortOrder === 'newest' ? 'arrow-down' : 'arrow-up'} size={16} color={colors.primary} />
              <Text style={styles.sortText}>{sortOrder === 'newest' ? 'Recientes' : 'Antiguos'}</Text>
            </Pressable>
            <Pressable onPress={onRefresh} style={styles.refreshButton} accessibilityLabel="Actualizar vuelos"><Ionicons name="refresh" size={20} color={colors.primary} /></Pressable>
          </View>
        </View>
        {loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : sortedFlights.length ? sortedFlights.map((flight) => <FlightCard
              key={flight.id}
              flight={flight}
              onPress={() => onOpenDetail(flight)}
              onLongPress={() =>
                confirmListDelete(flight)
              }
            />) : (
          <View style={styles.emptyCard}><Ionicons name="ticket-outline" size={30} color={colors.primary} /><Text style={styles.emptyTitle}>Tu diario empieza aquí</Text><Text style={styles.bodyCentered}>Solo necesitas un número de vuelo y una fecha para guardar el primero.</Text></View>
        )}
        <Text style={styles.footnote}>El tiempo y la distancia se calculan con los vuelos realizados que tengan esos datos.</Text>
      </ScrollView>
    </View>
  );
}


function BottomNavigation({ page, onChange, onAdd }: { page: Page; onChange: (page: Page) => void; onAdd: () => void }) {
  const leftItems: Array<{ page: Page; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { page: 'list', label: 'Vuelos', icon: 'airplane-outline' },
    { page: 'map', label: 'Mapa', icon: 'map-outline' },
  ];
  const rightItems: Array<{ page: Page; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { page: 'aircraft', label: 'Aviones', icon: 'paper-plane-outline' },
    { page: 'settings', label: 'Ajustes', icon: 'settings-outline' },
  ];
  const item = ({ page: itemPage, label, icon }: typeof leftItems[number]) => {
    const active = page === itemPage;
    return <Pressable key={itemPage} onPress={() => onChange(itemPage)} style={styles.bottomNavigationItem} accessibilityRole="tab" accessibilityState={{ selected: active }}><Ionicons name={icon} size={22} color={active ? colors.primary : colors.muted} /><Text style={[styles.bottomNavigationLabel, active && styles.bottomNavigationLabelActive]}>{label}</Text></Pressable>;
  };
  return (
    <View style={styles.bottomNavigation}>
      {leftItems.map(item)}
      <Pressable onPress={onAdd} style={({ pressed }) => [styles.addNavigationItem, pressed && styles.addNavigationPressed]} accessibilityRole="button" accessibilityLabel="Añadir vuelo">
        <View style={styles.addNavigationButton}><Ionicons name="add" size={32} color={colors.onPrimary} /></View>
        <Text style={styles.addNavigationLabel}>Añadir</Text>
      </Pressable>
      {rightItems.map(item)}
    </View>
  );
}

function SettingsScreen({ darkMode, onDarkModeChange, email, onSignOut }: {
  darkMode: boolean; onDarkModeChange: (enabled: boolean) => void; email?: string; onSignOut: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.settingsContent}>
      <Text style={styles.eyebrow}>PERSONALIZA TU DIARIO</Text>
      <Text style={styles.bigTitle}>Ajustes</Text>
      <Text style={styles.settingsIntro}>Adapta FlightLog a tu forma de viajar.</Text>

      <View style={styles.settingsCard}>
        <View style={styles.settingsRow}>
          <View style={styles.settingsIcon}><Ionicons name={darkMode ? 'moon' : 'sunny-outline'} size={22} color={colors.primary} /></View>
          <View style={styles.settingsText}>
            <Text style={styles.settingsTitle}>Modo noche</Text>
            <Text style={styles.settingsDescription}>Reduce el brillo y usa colores oscuros.</Text>
          </View>
          <Switch value={darkMode} onValueChange={onDarkModeChange} trackColor={{ false: colors.line, true: colors.primarySoft }} thumbColor={darkMode ? colors.primary : colors.muted} />
        </View>
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.settingsLabel}>CUENTA</Text>
        {email ? <Text style={styles.accountEmail}>{email}</Text> : null}
        <Pressable onPress={onSignOut} style={styles.signOutButton} accessibilityRole="button">
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.signOutText}>Cerrar sesión</Text>
        </Pressable>
      </View>
      <Text style={styles.dataCredit}>Aeropuertos: OpenFlights y Airport Data. Mapas: Natural Earth. Las fotos de aeronaves conservan el crédito y enlace a su publicación original.</Text>
    </ScrollView>
  );
}

function actualIsoFromScheduled(
  scheduled: string,
  actualTime?: string,
): string {
  if (!scheduled || !actualTime) {
    return '';
  }

  const match = scheduled.match(
    /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/,
  );

  if (!match) {
    return '';
  }

  return `${match[1]}T${actualTime}:00${match[3]}`;
}

function EditScreen({ initial, onSave, onDelete, onBack, busy }: {
  initial: Flight | null; onSave: (draft: FlightDraft) => void;
  onDelete: () => void; onBack: () => void; busy: boolean;
}) {
  const [draft, setDraft] = useState<FlightDraft>(() => initial ? flightToDraft(initial) : blankDraft());
  const [details, setDetails] = useState(Boolean(initial));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showArrivalPicker, setShowArrivalPicker] = useState(false);
  const [suggestions, setSuggestions] = useState<LookupSuggestion[]>([]);

  const [allowPlaneFinderProbe, setAllowPlaneFinderProbe] =
    useState(false);
  const [lookupState, setLookupState] = useState<'idle' | 'searching' | 'empty' | 'error'>('idle');

  const [
    allowFlighteraProbe,
    setAllowFlighteraProbe,
  ] = useState(false);
  
  // AUTO_STATUS_EFFECT
  useEffect(() => {
    setDraft((current) => {
      const status = draftAutomaticStatus(
        current.flightDate,
        current.actualArrivalAt,
      );

      if (current.status === status) {
        return current;
      }

      return {
        ...current,
        status,
      };
    });
  }, [
    draft.flightDate,
    draft.actualArrivalAt,
  ]);

  useEffect(() => {
    setDraft((current) => {
      const calculated = calculatedArrival(
        localDateKey(current.flightDate),
        current.departureTime,
        current.durationMinutes,
        current.departureCode,
        current.arrivalCode,
      );
      const arrivalTimeIsCalculated = current.fieldSources.arrivalTime === calculatedArrivalSource;
      const arrivalDateIsCalculated = current.fieldSources.arrivalDate === calculatedArrivalSource;

      if (!calculated) {
        if (!arrivalTimeIsCalculated && !arrivalDateIsCalculated) return current;
        const fieldSources = { ...current.fieldSources };
        delete fieldSources.arrivalTime;
        delete fieldSources.arrivalDate;
        return {
          ...current,
          arrivalTime: arrivalTimeIsCalculated ? '' : current.arrivalTime,
          arrivalDate: arrivalDateIsCalculated ? '' : current.arrivalDate,
          fieldSources,
        };
      }

      const canSetTime =
        !current.arrivalTime ||
        Boolean(current.fieldSources.arrivalTime) &&
          current.fieldSources.arrivalTime !== actualScheduleSource;
      const canSetDate =
        !current.arrivalDate ||
        Boolean(current.fieldSources.arrivalDate) &&
          current.fieldSources.arrivalDate !== actualScheduleSource;
      if (!canSetTime && !canSetDate) return current;
      const fieldSources = { ...current.fieldSources };
      if (canSetTime) fieldSources.arrivalTime = calculatedArrivalSource;
      if (canSetDate) fieldSources.arrivalDate = calculatedArrivalSource;
      const arrivalTime = canSetTime ? calculated.time : current.arrivalTime;
      const arrivalDate = canSetDate ? calculated.date : current.arrivalDate;
      if (arrivalTime === current.arrivalTime && arrivalDate === current.arrivalDate && fieldSources.arrivalTime === current.fieldSources.arrivalTime && fieldSources.arrivalDate === current.fieldSources.arrivalDate) return current;
      return { ...current, arrivalTime, arrivalDate, fieldSources };
    });
  }, [draft.departureCode, draft.arrivalCode, draft.departureTime, draft.durationMinutes, draft.flightDate]);

const set = <K extends keyof FlightDraft>(field: K, value: FlightDraft[K]) => setDraft((current) => {
    const fieldSources = { ...current.fieldSources };
    if (field === 'flightNumber') return { ...current, [field]: value, fieldSources: {} };
    delete fieldSources[field];
    if (field === 'departureCode') {
      const airport = getAirport(String(value));
      if (airport && (!current.departureName || current.fieldSources.departureName)) {
        fieldSources.departureName = 'Catálogo local';
        return { ...current, [field]: value, departureName: airport.name, fieldSources };
      }
    }
    if (field === 'arrivalCode') {
      const airport = getAirport(String(value));
      if (airport && (!current.arrivalName || current.fieldSources.arrivalName)) {
        fieldSources.arrivalName = 'Catálogo local';
        return { ...current, [field]: value, arrivalName: airport.name, fieldSources };
      }
    }
    return { ...current, [field]: value, fieldSources };
  });


  async function searchFlight() {
    const number = normalizedFlightNumber(draft.flightNumber);

    if (!canLookup(number)) {
      Alert.alert(
        'Número de vuelo inválido',
        'Escribe un número de vuelo válido, por ejemplo VY2616.',
      );
      return;
    }

    setSuggestions([]);
    setAllowFlighteraProbe(false);
    setLookupState('searching');

    try {
      console.log(
        'BUSCANDO VUELO:',
        number,
        localDateKey(draft.flightDate),
      );

      const results = await lookupFlight(
        number,
        draft.flightDate,
      );

      console.log(
        'RESULTADO FLIGHT LOOKUP:',
        JSON.stringify(results, null, 2),
      );

      setSuggestions(results);

    if (results.length > 0) {
      setAllowFlighteraProbe(true);
    }
      setLookupState(results.length ? 'idle' : 'empty');
    } catch (error) {
      setAllowFlighteraProbe(false);

      console.error('ERROR FLIGHT LOOKUP:', error);
      setLookupState('error');
    }
  }

  function chooseSuggestion(item: LookupSuggestion) {
    const nextDraft = applySuggestion(draft, item);

    setDraft(nextDraft);
    setSuggestions([]);
    setDetails(true);

    const dateKey = localDateKey(nextDraft.flightDate);

    setAllowPlaneFinderProbe(
      isRecentPlaneFinderDate(dateKey) &&
      Boolean(nextDraft.flightNumber) &&
      Boolean(nextDraft.departureCode) &&
      Boolean(nextDraft.arrivalCode) &&
      !nextDraft.registration
    );
  }

  function save() {
    const completedDraft = draftWithCalculatedArrival(draft);
    const error = validateDraft(completedDraft);
    if (error) { Alert.alert('Revisa el vuelo', error); return; }
    onSave(completedDraft);
  }

  function confirmDelete() {
    Alert.alert('¿Eliminar este vuelo?', 'Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: onDelete },
    ]);
  }

  const departureAirport = getAirport(draft.departureCode);
  const arrivalAirport = getAirport(draft.arrivalCode);
  const actualDeparture = localDateTimeParts(
    draft.actualDepartureAt,
    departureAirport?.timeZone,
  );
  const actualArrival = localDateTimeParts(
    draft.actualArrivalAt,
    arrivalAirport?.timeZone,
  );
  const scheduledDeparture = localDateTimeParts(
    draft.scheduledDepartureAt,
    departureAirport?.timeZone,
  );
  const scheduledArrival = localDateTimeParts(
    draft.scheduledArrivalAt,
    arrivalAirport?.timeZone,
  );
  const actualScheduleApplied =
    (!actualDeparture || draft.fieldSources.departureTime === actualScheduleSource) &&
    (!actualArrival || draft.fieldSources.arrivalTime === actualScheduleSource);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {allowPlaneFinderProbe &&
       draft.flightNumber &&
       draft.departureCode &&
       draft.arrivalCode &&
       (
        <PlaneFinderProbe
          flightNumber={draft.flightNumber}
          flightDate={localDateKey(draft.flightDate)}
          departureCode={draft.departureCode}
          arrivalCode={draft.arrivalCode}
          onData={(data) => {
            setAllowPlaneFinderProbe(false);

            setDraft((current) => ({
              ...current,
              registration:
                data.registration ||
                current.registration,
              aircraftModel:
                current.aircraftModel ||
                data.aircraftModel ||
                '',
              fieldSources: {
                ...current.fieldSources,
                ...(data.registration
                  ? { registration: 'PlaneFinder' }
                  : {}),
                ...(
                  data.aircraftModel &&
                  !current.aircraftModel
                    ? { aircraftModel: 'PlaneFinder' }
                    : {}
                ),
              },
            }));
          }}
          onFinished={() => {
            setAllowPlaneFinderProbe(false);
          }}
        />
      )}

      {/* FLIGHTERA_LIVE_PROBE */}
      {allowFlighteraProbe &&
       draft.departureCode &&
       draft.flightNumber &&
       (
        <FlighteraProbe
          url={
            'https://www.flightera.net/en/flight_details/' +
            normalizedFlightNumber(draft.flightNumber) +
            '/' +
            normalizedFlightNumber(draft.flightNumber) +
            '/' +
            draft.departureCode +
            '/' +
            localDateKey(draft.flightDate)
          }
          onData={(data) => {
            setAllowFlighteraProbe(false);

            setDraft((current) => {
              const actualDepartureAt =
                actualIsoFromScheduled(
                  current.scheduledDepartureAt,
                  data.actualDepartureTime,
                );

              const actualArrivalAt =
                actualIsoFromScheduled(
                  current.scheduledArrivalAt,
                  data.actualArrivalTime,
                );

              return {
                ...current,

                aircraftModel:
                  current.aircraftModel ||
                  data.aircraftModel ||
                  '',

                registration:
                  current.registration ||
                  data.registration ||
                  '',

                actualDepartureAt:
                  actualDepartureAt ||
                  current.actualDepartureAt,

                actualArrivalAt:
                  actualArrivalAt ||
                  current.actualArrivalAt,

                fieldSources: {
                  ...current.fieldSources,

                  ...(actualDepartureAt
                    ? {
                        actualDepartureAt:
                          'Flightera',
                      }
                    : {}),

                  ...(actualArrivalAt
                    ? {
                        actualArrivalAt:
                          'Flightera',
                      }
                    : {}),

                  ...(data.aircraftModel &&
                     !current.aircraftModel
                    ? {
                        aircraftModel:
                          'Flightera',
                      }
                    : {}),

                  ...(data.registration &&
                     !current.registration
                    ? {
                        registration:
                          'Flightera',
                      }
                    : {}),
                },
              };
            });
          }}
          onFinished={() => setAllowFlighteraProbe(false)}
        />
      )}

      <ScrollView contentContainerStyle={styles.editContent} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Pressable onPress={onBack} style={styles.iconButton} accessibilityLabel="Volver"><Ionicons name="arrow-back" size={23} color={colors.ink} /></Pressable>
          <Text style={styles.headerTitle}>{initial ? 'Editar vuelo' : 'Nuevo vuelo'}</Text>
          <View style={styles.iconButton} />
        </View>
        <Text style={styles.editIntro}>Empieza con lo esencial. El resto puede esperar.</Text>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Tu vuelo</Text>
          <InputField
            label="Número de vuelo (opcional)"
            value={draft.flightNumber}
            onChangeText={(value) => set('flightNumber', value)}
            placeholder="Por ejemplo, IB3170"
            autoCapitalize="characters"
            maxLength={12}
            hint="Si no lo conoces, puedes guardar el viaje completando la ruta manualmente."
          />
          <Text style={styles.fieldLabel}>Fecha de salida</Text>
          <Pressable onPress={() => setShowDatePicker(true)} style={styles.dateButton}><Ionicons name="calendar-outline" size={20} color={colors.primary} /><Text style={styles.dateText}>{dateLabel(localDateKey(draft.flightDate))}</Text></Pressable>
          {showDatePicker && (
            <DateTimePicker
              value={draft.flightDate}
              mode="date"
              display="default"
              onValueChange={(_, date) => {
                if (date) {
                  setDraft((current) => ({
                    ...current,
                    flightDate: date,
                    fieldSources: {},
                  }));
                }

                setShowDatePicker(false);
              }}
              onDismiss={() =>
                setShowDatePicker(false)
              }
            />
          )}
          {draft.flightNumber.trim() ? (
            <ActionButton
              label={lookupState === 'searching' ? 'Buscando vuelo…' : 'Buscar datos del vuelo'}
              onPress={searchFlight}
              disabled={lookupState === 'searching'}
              icon="search-outline"
            />
          ) : (
            <ActionButton
              label="Introducir los datos manualmente"
              onPress={() => setDetails(true)}
              secondary
              icon="create-outline"
            />
          )}
          
          {lookupState === 'searching' && <View style={styles.lookupMessage}><ActivityIndicator size="small" color={colors.primary} /><Text style={styles.lookupText}>Buscando datos del vuelo…</Text></View>}
          {suggestions.length > 0 && <View style={styles.lookupBox}>
            <Text style={styles.lookupTitle}>{suggestions.some((item) => item.kind === 'dated') ? 'Vuelo encontrado para esta fecha' : 'Rutas que suele cubrir este vuelo'}</Text>
            {suggestions.map((item, index) => <Pressable key={`${item.departureCode}-${item.arrivalCode}-${index}`} onPress={() => chooseSuggestion(item)} style={styles.lookupOption} accessibilityRole="button">
              <View style={styles.lookupOptionMain}><Text style={styles.lookupRoute}>{item.departureCode} → {item.arrivalCode}</Text><Ionicons name="chevron-forward" size={18} color={colors.primary} /></View>
              <Text style={styles.lookupText}>{item.departureTime && item.arrivalTime ? `${item.departureTime} · ${item.arrivalTime}` : 'Toca para completar la ruta'}{item.registration ? ` · Matrícula ${item.registration}` : ''}</Text>
            </Pressable>)}
            <Text style={styles.lookupHint}>{suggestions.some((item) => item.kind === 'dated') ? 'Comprueba los datos antes de guardar: la asignación del avión puede cambiar.' : 'Es una ruta habitual, no una confirmación para la fecha elegida. Revisa horarios y matrícula.'}</Text>
          </View>}
          {lookupState === 'empty' && <Text style={styles.lookupText}>No encontramos datos para este número y fecha. Puedes completar el vuelo a mano.</Text>}
          {lookupState === 'error' && <Text style={styles.lookupText}>La búsqueda no está disponible ahora. Puedes completar el vuelo a mano.</Text>}
          <Text style={styles.fieldLabel}>
            Estado
          </Text>

          <View
            style={[
              styles.statusPill,
              draft.status === 'planned' &&
                styles.statusPlanned,
              {
                alignSelf: 'flex-start',
                marginBottom: 4,
                paddingHorizontal: 14,
                paddingVertical: 8,
              },
            ]}
          >
            <Text style={styles.statusText}>
              {draft.status === 'planned'
                ? 'Previsto'
                : 'Realizado'}
            </Text>
          </View>
        </View>
        <Pressable onPress={() => setDetails(!details)} style={styles.expandButton}>
          <Text style={styles.expandText}>{details ? 'Ocultar detalles' : 'Añadir detalles'}</Text><Ionicons name={details ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
        </Pressable>
        {details && <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Ruta y horarios</Text>
            <InputField label="Aerolínea" value={draft.airlineName} onChangeText={(value) => set('airlineName', value)} placeholder="Por ejemplo, Iberia" />
            <View style={styles.twoCols}>
              <View style={styles.col}><InputField label="Salida" value={draft.departureCode} onChangeText={(value) => set('departureCode', value)} placeholder="MAD" autoCapitalize="characters" maxLength={4} /></View>
              <View style={styles.col}><InputField label="Llegada" value={draft.arrivalCode} onChangeText={(value) => set('arrivalCode', value)} placeholder="LHR" autoCapitalize="characters" maxLength={4} /></View>
            </View>
            <InputField label="Nombre aeropuerto de salida" value={draft.departureName} onChangeText={(value) => set('departureName', value)} placeholder="Opcional" />
            <InputField label="Nombre aeropuerto de llegada" value={draft.arrivalName} onChangeText={(value) => set('arrivalName', value)} placeholder="Opcional" />
            <View style={styles.twoCols}>
              <View style={styles.col}>
                <InputField
                  label="Hora de salida"
                  value={draft.departureTime}
                  onChangeText={(value) =>
                    set('departureTime', value)
                  }
                  placeholder="HH:mm"
                  keyboardType="numeric"
                  maxLength={5}
                />
              </View>

              <View style={styles.col}>
                <InputField
                  label="Hora de llegada"
                  value={draft.arrivalTime}
                  onChangeText={(value) =>
                    set('arrivalTime', value)
                  }
                  placeholder="HH:mm"
                  keyboardType="numeric"
                  maxLength={5}
                />
              </View>
            </View>

            {(actualDeparture || actualArrival) && (
              <View style={styles.realScheduleCard}>
                <View style={styles.scheduleHeading}>
                  <View style={styles.scheduleHeadingText}>
                    <Text style={styles.scheduleTitle}>Horario real disponible</Text>
                    <Text style={styles.scheduleDescription}>Compáralo con el previsto y decide si quieres usarlo en la ficha.</Text>
                  </View>
                  <Ionicons name="checkmark-circle-outline" size={25} color={colors.primary} />
                </View>
                <View style={styles.scheduleComparison}>
                  <View style={styles.scheduleColumn}>
                    <Text style={styles.scheduleColumnLabel}>Previsto</Text>
                    <Text style={styles.scheduleTimes}>
                      {scheduledDeparture?.time || draft.departureTime || '--:--'} → {scheduledArrival?.time || draft.arrivalTime || '--:--'}
                    </Text>
                  </View>
                  <View style={styles.scheduleColumn}>
                    <Text style={styles.scheduleColumnLabel}>Real</Text>
                    <Text style={styles.scheduleTimes}>
                      {actualDeparture?.time || '--:--'} → {actualArrival?.time || '--:--'}
                    </Text>
                  </View>
                </View>
                <ActionButton
                  label={actualScheduleApplied ? 'Horario real aplicado' : 'Actualizar con el horario real'}
                  onPress={() => setDraft((current) => applyActualScheduleToDraft(current))}
                  disabled={actualScheduleApplied}
                  secondary
                  icon={actualScheduleApplied ? 'checkmark' : 'refresh'}
                />
              </View>
            )}

            <Text style={styles.fieldLabel}>Fecha de llegada</Text>
            <Pressable onPress={() => setShowArrivalPicker(true)} style={styles.dateButton}><Ionicons name="calendar-outline" size={20} color={colors.primary} /><Text style={styles.dateText}>{draft.arrivalDate ? dateLabel(draft.arrivalDate) : 'Sin especificar'}</Text></Pressable>
            {showArrivalPicker && (
              <DateTimePicker
                value={
                  draft.arrivalDate
                    ? new Date(
                        `${draft.arrivalDate}T12:00:00`,
                      )
                    : draft.flightDate
                }
                mode="date"
                display="default"
                onValueChange={(_, date) => {
                  if (date) {
                    set(
                      'arrivalDate',
                      localDateKey(date),
                    );
                  }

                  setShowArrivalPicker(false);
                }}
                onDismiss={() =>
                  setShowArrivalPicker(false)
                }
              />
            )}
            {Boolean(draft.arrivalDate) && <Pressable onPress={() => set('arrivalDate', '')}><Text style={styles.linkText}>Quitar fecha de llegada</Text></Pressable>}
            <InputField label="Duración en minutos" value={draft.durationMinutes} onChangeText={(value) => set('durationMinutes', value)} placeholder="Por ejemplo, 145" keyboardType="numeric" hint="Se usa para sumar tu tiempo en el aire." />

            {draft.distanceKm ? (
              <View
                style={{
                  marginTop: 16,
                  marginBottom: 4,
                  backgroundColor: colors.input,
                  borderRadius: 16,
                  padding: 16,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.muted,
                    marginBottom: 5,
                  }}
                >
                  Distancia del vuelo
                </Text>

                <Text
                  style={{
                    fontSize: 24,
                    fontWeight: '700',
                    color: colors.ink,
                  }}
                >
                  {draft.distanceKm} km
                </Text>
              </View>
            ) : null}

          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>A bordo</Text>
            <AircraftModelPicker
              value={draft.aircraftModel}
              colors={colors}
              onChange={(value) =>
                set('aircraftModel', value)
              }
            />
            <InputField label="Matrícula" value={draft.registration} onChangeText={(value) => set('registration', value)} placeholder="Por ejemplo, EC-MXY" autoCapitalize="characters" />
            <View style={styles.twoCols}>
              <View style={styles.col}><InputField label="Asiento" value={draft.seat} onChangeText={(value) => set('seat', value)} placeholder="12A" autoCapitalize="characters" /></View>
              <View style={styles.col}><InputField label="Clase" value={draft.cabinClass} onChangeText={(value) => set('cabinClass', value)} placeholder="Turista" /></View>
            </View>
            <InputField label="Comentarios" value={draft.notes} onChangeText={(value) => set('notes', value)} placeholder="Lo que quieras recordar…" multiline />
          </View>
        </>}
        <ActionButton label={busy ? 'Guardando…' : 'Guardar vuelo'} onPress={save} disabled={busy} icon="checkmark" />
        {initial && <Pressable onPress={confirmDelete} style={styles.deleteButton} disabled={busy}><Text style={styles.deleteText}>Eliminar vuelo</Text></Pressable>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function App() {
  const { width: viewportWidth } = useWindowDimensions();
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [page, setPage] = useState<Page>('list');
  const [editReturnPage, setEditReturnPage] = useState<'list' | 'detail'>('list');
  const [detailReturnPage, setDetailReturnPage] = useState<'list' | 'map'>('list');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [darkMode, setDarkMode] = useState(false);
  const [editing, setEditing] = useState<Flight | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingActual, setUpdatingActual] = useState(false);
  const [settledTab, setSettledTab] = useState<TabPage>('list');
  const pagerOffset = useRef(new Animated.Value(0)).current;
  const currentPage = useRef<Page>(page);
  const swipeStartIndex = useRef(0);
  const viewportWidthRef = useRef(viewportWidth);
  const mapGestureActive = useRef(false);
  currentPage.current = page;
  viewportWidthRef.current = viewportWidth;
  const handleMapGestureActive = useCallback((active: boolean) => { mapGestureActive.current = active; }, []);

  const tabSwipeResponder = useMemo(() => {
    const animateToIndex = (index: number, onComplete?: () => void) => Animated.timing(pagerOffset, {
      toValue: -index * viewportWidthRef.current,
      duration: 240,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start(({ finished }) => {
      if (finished) onComplete?.();
    });
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => {
        const isTab = isTabPage(currentPage.current);
        return isTab && !mapGestureActive.current && Math.abs(gesture.dx) > 14 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.35;
      },
      onPanResponderGrant: () => {
        swipeStartIndex.current = isTabPage(currentPage.current) ? tabPages.indexOf(currentPage.current) : 0;
        pagerOffset.stopAnimation();
      },
      onPanResponderMove: (_event, gesture) => {
        const width = viewportWidthRef.current;
        const atStart = swipeStartIndex.current === 0 && gesture.dx > 0;
        const atEnd = swipeStartIndex.current === tabPages.length - 1 && gesture.dx < 0;
        const drag = gesture.dx * (atStart || atEnd ? 0.22 : 1);
        pagerOffset.setValue(-swipeStartIndex.current * width + drag);
      },
      onPanResponderRelease: (_event, gesture) => {
        const direction = gesture.dx < 0 ? 1 : -1;
        const destination = swipeStartIndex.current + direction;
        const shouldChange = destination >= 0 && destination < tabPages.length && (Math.abs(gesture.dx) > 72 || Math.abs(gesture.vx) > 0.55);
        if (!shouldChange) {
          animateToIndex(swipeStartIndex.current);
          return;
        }
        const destinationPage = tabPages[destination];
        setPage(destinationPage);
        animateToIndex(destination, () => setSettledTab(destinationPage));
      },
      onPanResponderTerminate: () => animateToIndex(swipeStartIndex.current),
      onPanResponderTerminationRequest: () => true,
    });
  }, [pagerOffset]);

  const navigateTab = useCallback((destinationPage: Page) => {
    if (!isTabPage(destinationPage)) {
      setPage(destinationPage);
      return;
    }
    const destination = tabPages.indexOf(destinationPage);
    pagerOffset.stopAnimation();
    if (currentPage.current === destinationPage) {
      pagerOffset.setValue(-destination * viewportWidthRef.current);
      setSettledTab(destinationPage);
      return;
    }
    setPage(destinationPage);
    Animated.timing(pagerOffset, {
      toValue: -destination * viewportWidthRef.current,
      duration: 240,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start(({ finished }) => {
      if (finished) setSettledTab(destinationPage);
    });
  }, [pagerOffset]);

  useEffect(() => {
    const activePage = currentPage.current;
    if (isTabPage(activePage)) pagerOffset.setValue(-tabPages.indexOf(activePage) * viewportWidth);
  }, [pagerOffset, viewportWidth]);

  colors = darkMode ? darkColors : lightColors;
  styles = createStyles(colors);

  useEffect(() => {
    Promise.all([
      Storage.getItem('flightlog.darkMode'),
      Storage.getItem('flightlog.sortOrder'),
    ]).then(([savedDarkMode, savedSortOrder]) => {
      setDarkMode(savedDarkMode === 'true');
      if (savedSortOrder === 'oldest' || savedSortOrder === 'newest') setSortOrder(savedSortOrder);
    }).catch(() => undefined);
  }, []);


  useEffect(() => {
    if (!supabase) { setBooting(false); return; }
    const client = supabase;
    client.auth.getSession().then(({ data }) => { setSession(data.session); setBooting(false); }).catch(() => setBooting(false));
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setFlights([]);
        pagerOffset.setValue(0);
        setSettledTab('list');
        setPage('list');
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [pagerOffset]);

  const loadFlights = useCallback(async () => {
    if (!supabase || !session) return;
    const client = supabase;
    const userId = session.user.id;
    setLoading(true);
    try {
      const { data, error } = await client.from('flights').select('*').order('flight_date', { ascending: false }).order('created_at', { ascending: false });
      if (error) throw error;
      const loadedFlights = (data ?? []) as Flight[];
      const completions = loadedFlights
        .map(flightWithCalculatedArrival)
        .filter((completion): completion is NonNullable<typeof completion> => Boolean(completion));
      const completedById = new Map(completions.map((completion) => [completion.flight.id, completion.flight]));
      setFlights(loadedFlights.map((flight) => completedById.get(flight.id) || flight));

      if (completions.length) {
        void Promise.allSettled(completions.map(async ({ flight, patch }) => {
          const { error: updateError } = await client
            .from('flights')
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq('id', flight.id)
            .eq('user_id', userId);
          if (updateError) throw updateError;
        })).then((results) => {
          const failed = results.filter((result) => result.status === 'rejected').length;
          if (failed) console.warn(`No se pudieron completar ${failed} horas de llegada.`);
        });
      }
    } catch (error) {
      Alert.alert('No se pudieron cargar los vuelos', error instanceof Error ? error.message : 'Revisa tu conexión e inténtalo de nuevo.');
    } finally { setLoading(false); }
  }, [session]);

  useEffect(() => { if (session) void loadFlights(); }, [session, loadFlights]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (page !== 'list') {
        back();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [page]);

  function openNew() { setEditing(null); setEditReturnPage('list'); setPage('edit'); }
  function openDetail(flight: Flight, returnPage: 'list' | 'map' = 'list') { setEditing(flight); setDetailReturnPage(returnPage); setPage('detail'); }
  function openEdit(flight: Flight) { setEditing(flight); setEditReturnPage('detail'); setPage('edit'); }
  function openFlightFromDetail(flight: Flight) { setEditing(flight); setPage('detail'); }
  function closeToList() {
    pagerOffset.setValue(0);
    setSettledTab('list');
    setPage('list');
    setEditing(null);
    setEditReturnPage('list');
  }
  function back() {
    if (page === 'edit' && editReturnPage === 'detail' && editing) {
      setPage('detail');
      return;
    }
    if (page === 'detail') {
      setPage(detailReturnPage);
      setEditing(null);
      setEditReturnPage('list');
      return;
    }
    closeToList();
  }
  function toggleSort() {
    setSortOrder((current) => {
      const next = current === 'newest' ? 'oldest' : 'newest';
      void Storage.setItem('flightlog.sortOrder', next);
      return next;
    });
  }
  function changeDarkMode(enabled: boolean) {
    setDarkMode(enabled);
    void Storage.setItem('flightlog.darkMode', String(enabled));
  }

  async function persistFlight(draft: FlightDraft) {
    if (!supabase || !session) return;
    setSaving(true);
    try {
      const row = draftToRow(draft, session.user.id);
      const result = editing
        ? await supabase.from('flights').update(row).eq('id', editing.id).eq('user_id', session.user.id).select('id').single()
        : await supabase.from('flights').insert(row).select('id').single();
      if (result.error) throw result.error;
      closeToList();
      await loadFlights();
    } catch (error) {
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Revisa tu conexión e inténtalo de nuevo.');
    } finally { setSaving(false); }
  }

  async function applyActualTimes(flight: Flight) {
    if (!supabase || !session) return;
    const draft = applyActualScheduleToDraft(flightToDraft(flight));
    setUpdatingActual(true);

    try {
      const { data, error } = await supabase
        .from('flights')
        .update(draftToRow(draft, session.user.id))
        .eq('id', flight.id)
        .eq('user_id', session.user.id)
        .select('*')
        .single();

      if (error) throw error;
      const updatedFlight = data as Flight;
      setEditing(updatedFlight);
      setFlights((current) => current.map((item) => item.id === updatedFlight.id ? updatedFlight : item));
    } catch (error) {
      Alert.alert(
        'No se pudo actualizar el horario',
        error instanceof Error ? error.message : 'Revisa tu conexión e inténtalo de nuevo.',
      );
    } finally {
      setUpdatingActual(false);
    }
  }

  function save(draft: FlightDraft) {
    const number = normalizedFlightNumber(draft.flightNumber);
    const date = localDateKey(draft.flightDate);
    const departureCode = draft.departureCode.trim().toUpperCase();
    const arrivalCode = draft.arrivalCode.trim().toUpperCase();
    const duplicate = flights.find((flight) => {
      if (flight.id === editing?.id || flight.flight_date !== date) return false;
      if (number) {
        return normalizedFlightNumber(flight.flight_number ?? '') === number;
      }
      return Boolean(
        departureCode &&
        arrivalCode &&
        flight.departure_airport_code === departureCode &&
        flight.arrival_airport_code === arrivalCode,
      );
    });
    if (duplicate) {
      const identifier = number || `${departureCode} → ${arrivalCode}`;
      Alert.alert('Este vuelo ya está guardado', `${identifier} del ${shortDateLabel(date)} ya aparece en tu diario.`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Guardar igualmente', onPress: () => void persistFlight(draft) },
      ]);
      return;
    }
    void persistFlight(draft);
  }

  async function removeFlightFromList(
    flight: Flight,
  ) {
    if (!supabase || !session) {
      return;
    }

    try {
      const { error } = await supabase
        .from('flights')
        .delete()
        .eq('id', flight.id)
        .eq('user_id', session.user.id);

      if (error) {
        throw error;
      }

      await loadFlights();
    } catch (error) {
      Alert.alert(
        'No se pudo eliminar',
        error instanceof Error
          ? error.message
          : 'Revisa tu conexión e inténtalo de nuevo.',
      );
    }
  }

  async function remove() {
    if (!supabase || !session || !editing) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('flights').delete().eq('id', editing.id).eq('user_id', session.user.id);
      if (error) throw error;
      closeToList();
      await loadFlights();
    } catch (error) {
      Alert.alert('No se pudo eliminar', error instanceof Error ? error.message : 'Revisa tu conexión e inténtalo de nuevo.');
    } finally { setSaving(false); }
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <StatusBar style={darkMode ? 'light' : 'dark'} />
        {!isConfigured ? <SetupScreen /> : booting ? <ActivityIndicator style={styles.centered} color={colors.primary} /> : !session ? <AuthScreen /> : page === 'edit' ? (
          <EditScreen key={editing?.id ?? 'new'} initial={editing} onSave={save} onDelete={remove} onBack={back} busy={saving} />
        ) : page === 'detail' && editing ? (
          <FlightDetailScreen
            flight={editing}
            flights={flights}
            colors={colors}
            onBack={back}
            onEdit={() => openEdit(editing)}
            onOpenFlight={openFlightFromDetail}
            onApplyActualTimes={() => void applyActualTimes(editing)}
            updatingActual={updatingActual}
          />
        ) : (
          <View style={styles.flex}>
            <View style={styles.pagerViewport} {...tabSwipeResponder.panHandlers}>
              <Animated.View style={[styles.pagerTrack, { width: viewportWidth * tabPages.length, transform: [{ translateX: pagerOffset }] }]}>
                <View style={[styles.pagerPage, { width: viewportWidth }]}>
                  <ListScreen flights={flights} loading={loading} sortOrder={sortOrder} onToggleSort={toggleSort} onRefresh={() => void loadFlights()} onOpenDetail={openDetail} onDelete={removeFlightFromList} />
                </View>
                <View style={[styles.pagerPage, { width: viewportWidth }]}>
                  <GlobalMapScreen flights={flights} colors={colors} onOpenFlight={(flight) => openDetail(flight, 'map')} onMapGestureActive={handleMapGestureActive} />
                </View>
                <View style={[styles.pagerPage, { width: viewportWidth }]}>
                  <AircraftScreen flights={flights} colors={colors} active={settledTab === 'aircraft'} />
                </View>
                <View style={[styles.pagerPage, { width: viewportWidth }]}>
                  <SettingsScreen darkMode={darkMode} onDarkModeChange={changeDarkMode} email={session.user.email} onSignOut={() => void supabase?.auth.signOut()} />
                </View>
              </Animated.View>
            </View>
            <BottomNavigation page={page} onChange={navigateTab} onAdd={openNew} />
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  flex: { flex: 1 }, safeArea: { flex: 1, backgroundColor: colors.background },
  pagerViewport: { flex: 1, overflow: 'hidden' },
  pagerTrack: { flex: 1, flexDirection: 'row' },
  pagerPage: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', padding: 28 },
  logo: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  bigTitle: { fontSize: 33, fontWeight: '800', letterSpacing: -0.8, color: colors.ink },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 9 },
  authContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 34 },
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: colors.line },
  authCard: { marginTop: 30 },
  sectionTitle: { color: colors.ink, fontSize: 19, fontWeight: '700', marginBottom: 18 },
  field: { marginBottom: 16 }, fieldLabel: { color: colors.ink, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  inputContainer: { position: 'relative' },
  input: { width: '100%', minHeight: 52, backgroundColor: colors.input, borderColor: colors.line, borderWidth: 1, borderRadius: 15, paddingHorizontal: 15, color: colors.ink, fontSize: 16 },
  inputWithAccessory: { paddingRight: 52 },
  inputAccessory: { position: 'absolute', right: 15, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  inputMultiline: { minHeight: 92, paddingTop: 14, textAlignVertical: 'top' },
  fieldHint: { color: colors.muted, fontSize: 12, marginTop: 6 },
  button: { minHeight: 54, backgroundColor: colors.primary, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 18 },
  buttonSecondary: { backgroundColor: colors.primarySoft }, buttonDimmed: { opacity: 0.65 },
  buttonText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' }, buttonTextSecondary: { color: colors.primary },
  switchAuth: { alignItems: 'center', padding: 18 }, linkText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  noticeCard: { backgroundColor: colors.surface, borderRadius: 22, padding: 20, marginTop: 30 }, noticeTitle: { color: colors.ink, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 }, bodyCentered: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  listContent: { padding: 20, paddingBottom: 115 }, headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 21 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.6, color: colors.primary, marginBottom: 5 },
  iconButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  journeySummary: { backgroundColor: colors.surface, borderRadius: 23, borderWidth: 1, borderColor: colors.line, padding: 17, marginBottom: 14 },
  journeySummaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 15 }, journeySummaryTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' }, journeySummaryMeta: { color: colors.muted, fontSize: 10 },
  journeySummaryGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 }, journeyMetric: { width: '50%' }, journeyMetricValue: { color: colors.ink, fontSize: 19, fontWeight: '800' }, journeyMetricLabel: { color: colors.muted, fontSize: 10, marginTop: 2 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingHorizontal: 2 },
  listActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sortButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.primarySoft },
  sortText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  refreshButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  flightCard: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 18, marginBottom: 12 },
  flightTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  flightIdentity: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flightNumberPill: { borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 },
  flightNumberText: { fontSize: 13, fontWeight: '800' },
  aircraftIcon: { width: 36, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  flightDate: { color: colors.muted, fontSize: 13 },
  routeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 23, marginBottom: 19 },
  routeCode: { color: colors.ink, fontSize: 23, fontWeight: '800', minWidth: 76 },
  routeLine: { flex: 1, flexDirection: 'row', alignItems: 'center', marginHorizontal: 10, gap: 4 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary }, line: { flex: 1, height: 1, backgroundColor: colors.routeLine },
  flightBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  flightDetails: { flex: 1 }, flightMeta: { color: colors.muted, fontSize: 13 },
  aircraftMeta: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  statusPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  statusFlown: { backgroundColor: colors.completedBackground }, statusPlanned: { backgroundColor: colors.plannedBackground },
  statusText: { fontSize: 11, fontWeight: '700' }, statusTextFlown: { color: colors.completedText }, statusTextPlanned: { color: colors.plannedText },
  emptyCard: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 24, padding: 30, gap: 10 },
  emptyTitle: { color: colors.ink, fontSize: 18, fontWeight: '700' }, footnote: { color: colors.muted, fontSize: 11, marginTop: 8 }, loader: { marginVertical: 30 },
  editContent: { padding: 20, paddingBottom: 50 }, headerTitle: { color: colors.ink, fontSize: 19, fontWeight: '700' },
  editIntro: { color: colors.muted, fontSize: 15, marginBottom: 21 },
  dateButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, borderRadius: 15, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line, marginBottom: 18 },
  dateText: { color: colors.ink, fontSize: 16 },
  segmentRow: { flexDirection: 'row', backgroundColor: colors.input, padding: 4, borderRadius: 15 },
  segment: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  segmentActive: { backgroundColor: colors.primary }, segmentText: { color: colors.muted, fontWeight: '600' }, segmentTextActive: { color: colors.onPrimary },
  expandButton: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, padding: 15, marginBottom: 5 },
  expandText: { color: colors.primary, fontSize: 15, fontWeight: '700' }, twoCols: { flexDirection: 'row', gap: 12 }, col: { flex: 1 },
  realScheduleCard: { backgroundColor: colors.primarySoft, borderRadius: 19, padding: 15, marginBottom: 18 },
  scheduleHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 13 }, scheduleHeadingText: { flex: 1 },
  scheduleTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' }, scheduleDescription: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  scheduleComparison: { flexDirection: 'row', gap: 9, marginBottom: 12 }, scheduleColumn: { flex: 1, backgroundColor: colors.surface, borderRadius: 13, padding: 12 },
  scheduleColumnLabel: { color: colors.muted, fontSize: 10, fontWeight: '700' }, scheduleTimes: { color: colors.ink, fontSize: 15, fontWeight: '800', marginTop: 4 },
  deleteButton: { alignItems: 'center', padding: 20 }, deleteText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
  lookupMessage: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 16 },
  lookupBox: { borderRadius: 18, backgroundColor: colors.primarySoft, padding: 15, marginBottom: 18 },
  lookupTitle: { color: colors.ink, fontSize: 15, fontWeight: '700', marginBottom: 8 },
  lookupOption: { backgroundColor: colors.surface, borderRadius: 13, padding: 12, marginBottom: 7 },
  lookupOptionMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lookupRoute: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  lookupText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 7 },
  lookupHint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  bottomNavigation: { position: 'absolute', left: 14, right: 14, bottom: 10, minHeight: 72, flexDirection: 'row', alignItems: 'stretch', backgroundColor: colors.tabBar, borderRadius: 24, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 6, paddingVertical: 7, shadowColor: '#000000', shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 6 },
  bottomNavigationItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 16 },
  bottomNavigationLabel: { color: colors.muted, fontSize: 10, fontWeight: '600' }, bottomNavigationLabelActive: { color: colors.primary },
  addNavigationItem: { flex: 1.12, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 1 }, addNavigationPressed: { opacity: .72, transform: [{ scale: .96 }] },
  addNavigationButton: { position: 'absolute', top: -24, width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary, borderWidth: 5, borderColor: colors.tabBar, alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: .2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 9 },
  addNavigationLabel: { color: colors.primary, fontSize: 10, fontWeight: '800' },
  settingsContent: { padding: 20, paddingBottom: 120 }, settingsIntro: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 25 },
  settingsCard: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 18, marginBottom: 14 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 13 }, settingsIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  settingsText: { flex: 1 }, settingsTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' }, settingsDescription: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  settingsLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.3 }, accountEmail: { color: colors.ink, fontSize: 15, marginTop: 12, marginBottom: 16 },
  signOutButton: { minHeight: 48, borderRadius: 15, backgroundColor: colors.input, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, signOutText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
  dataCredit: { color: colors.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 8, paddingHorizontal: 20 },
  });
}
