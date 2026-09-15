import { FlightRouteMap } from './src/components/FlightRouteMap';
import { FlighteraProbe } from './src/components/FlighteraProbe';
import DateTimePicker from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import {
  blankDraft, dateLabel, draftToRow, Flight, FlightDraft, flightToDraft,
  formatDuration, localDateKey, shortDateLabel, validateDraft,
} from './src/lib/flights';
import { isConfigured, supabase } from './src/lib/supabase';
import { applySuggestion, canLookup, lookupFlight, LookupSuggestion, normalizedFlightNumber } from './src/lib/lookup';
import { colors } from './src/theme';

type Page = 'list' | 'edit';

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
      {icon && <Ionicons name={icon} size={19} color={secondary ? colors.primary : '#FFFFFF'} />}
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

function InputField({ label, value, onChangeText, placeholder, autoCapitalize, keyboardType, multiline, hint, maxLength }: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'numeric' | 'email-address'; multiline?: boolean;
  hint?: string; maxLength?: number;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9AABA9"
        autoCapitalize={autoCapitalize ?? 'sentences'}
        autoCorrect={false}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        maxLength={maxLength}
      />
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
          <InputField label="Contraseña" value={password} onChangeText={setPassword} placeholder="Al menos 6 caracteres" autoCapitalize="none" />
          <ActionButton label={busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'} onPress={submit} disabled={busy} />
          <Pressable onPress={() => setMode(mode === 'login' ? 'signup' : 'login')} style={styles.switchAuth}>
            <Text style={styles.linkText}>{mode === 'login' ? '¿Aún no tienes cuenta? Crear una' : 'Ya tengo cuenta'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FlightCard({ flight, onPress }: { flight: Flight; onPress: () => void }) {
  const route = [flight.departure_airport_code, flight.arrival_airport_code];
  const hasRoute = route.every(Boolean);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.flightCard, pressed && styles.buttonDimmed]} accessibilityRole="button">
      <View style={styles.flightTop}>
        <View style={styles.flightNumberPill}><Text style={styles.flightNumberText}>{flight.flight_number}</Text></View>
        <Text style={styles.flightDate}>{shortDateLabel(flight.flight_date)}</Text>
      </View>
      <View style={styles.routeRow}>
        <Text style={styles.routeCode}>{hasRoute ? route[0] : 'Salida'}</Text>
        <View style={styles.routeLine}><View style={styles.dot} /><View style={styles.line} /><Ionicons name="airplane" size={17} color={colors.primary} /><View style={styles.line} /><View style={styles.dot} /></View>
        <Text style={styles.routeCode}>{hasRoute ? route[1] : 'Llegada'}</Text>
      </View>
      <View style={styles.flightBottom}>
        <Text style={styles.flightMeta}>{flight.airline_name || (hasRoute ? 'Vuelo guardado' : 'Añade la ruta cuando quieras')}</Text>
        <View style={[styles.statusPill, flight.status === 'planned' && styles.statusPlanned]}>
          <Text style={styles.statusText}>{flight.status === 'planned' ? 'Previsto' : 'Realizado'}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function ListScreen({ flights, loading, onRefresh, onAdd, onEdit, onSignOut }: {
  flights: Flight[]; loading: boolean; onRefresh: () => void; onAdd: () => void;
  onEdit: (flight: Flight) => void; onSignOut: () => void;
}) {
  const completed = flights.filter((flight) => flight.status === 'flown');
  const minutes = completed.reduce((sum, flight) => sum + (flight.duration_minutes ?? 0), 0);
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.listContent}>
        <View style={styles.headerRow}>
          <View><Text style={styles.eyebrow}>MI DIARIO DE VIAJE</Text><Text style={styles.bigTitle}>Tus vuelos</Text></View>
          <Pressable onPress={onSignOut} style={styles.iconButton} accessibilityLabel="Cerrar sesión"><Ionicons name="log-out-outline" size={22} color={colors.muted} /></Pressable>
        </View>
        <View style={styles.heroCard}>
          <View style={styles.heroCircle}><Ionicons name="airplane" size={27} color={colors.primary} /></View>
          <Text style={styles.heroTitle}>Cada viaje cuenta</Text>
          <Text style={styles.heroText}>Guarda tus vuelos de antes y los que están por venir. Completa los detalles a tu ritmo.</Text>
          <ActionButton label="Añadir vuelo" onPress={onAdd} icon="add" />
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statCard}><Text style={styles.statValue}>{completed.length}</Text><Text style={styles.statLabel}>realizados</Text></View>
          <View style={styles.statCard}><Text style={styles.statValue}>{flights.length - completed.length}</Text><Text style={styles.statLabel}>previstos</Text></View>
          <View style={styles.statCard}><Text style={styles.statValue}>{Math.floor(minutes / 60)} h</Text><Text style={styles.statLabel}>en el aire*</Text></View>
        </View>
        <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Todos los vuelos</Text><Pressable onPress={onRefresh}><Ionicons name="refresh" size={20} color={colors.primary} /></Pressable></View>
        {loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : flights.length ? flights.map((flight) => <FlightCard key={flight.id} flight={flight} onPress={() => onEdit(flight)} />) : (
          <View style={styles.emptyCard}><Ionicons name="ticket-outline" size={30} color={colors.primary} /><Text style={styles.emptyTitle}>Tu diario empieza aquí</Text><Text style={styles.bodyCentered}>Solo necesitas un número de vuelo y una fecha para guardar el primero.</Text></View>
        )}
        <Text style={styles.footnote}>* Se suma la duración que hayas introducido en vuelos realizados.</Text>
      </ScrollView>
    </View>
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

function minutesBetweenIso(
  start: string,
  end: string,
): string {
  const a = Date.parse(start);
  const b = Date.parse(end);

  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return '';
  }

  let minutes = Math.round((b - a) / 60000);

  // llegada pasada medianoche
  if (minutes < 0) {
    minutes += 24 * 60;
  }

  return String(minutes);
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
  const [lookupState, setLookupState] = useState<'idle' | 'searching' | 'empty' | 'error'>('idle');
  const set = <K extends keyof FlightDraft>(field: K, value: FlightDraft[K]) => setDraft((current) => {
    const fieldSources = { ...current.fieldSources };
    if (field === 'flightNumber') return { ...current, [field]: value, fieldSources: {} };
    delete fieldSources[field];
    return { ...current, [field]: value, fieldSources };
  });


  async function searchFlight() {
    const number = normalizedFlightNumber(draft.flightNumber);

    if (!canLookup(number)) {
      Alert.alert(
        'N�mero de vuelo inv�lido',
        'Escribe un n�mero de vuelo v�lido, por ejemplo VY2616.',
      );
      return;
    }

    setSuggestions([]);
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
      setLookupState(results.length ? 'idle' : 'empty');
    } catch (error) {
      console.error('ERROR FLIGHT LOOKUP:', error);
      setLookupState('error');
    }
  }

  function chooseSuggestion(item: LookupSuggestion) {
    setDraft((current) => applySuggestion(current, item));
    setSuggestions([]);
    setDetails(true);
  }

  function save() {
    const error = validateDraft(draft);
    if (error) { Alert.alert('Revisa el vuelo', error); return; }
    onSave(draft);
  }

  function confirmDelete() {
    Alert.alert('¿Eliminar este vuelo?', 'Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: onDelete },
    ]);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* FLIGHTERA_LIVE_PROBE */}
      {draft.departureCode &&
       draft.flightNumber &&
       draft.scheduledDepartureAt &&
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

              const realDuration =
                actualDepartureAt &&
                actualArrivalAt
                  ? minutesBetweenIso(
                      actualDepartureAt,
                      actualArrivalAt,
                    )
                  : current.durationMinutes;

              return {
                ...current,

                actualDepartureAt:
                  actualDepartureAt ||
                  current.actualDepartureAt,

                actualArrivalAt:
                  actualArrivalAt ||
                  current.actualArrivalAt,

                durationMinutes:
                  realDuration,

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

                  ...(actualDepartureAt &&
                     actualArrivalAt
                    ? {
                        durationMinutes:
                          'Flightera:actual',
                      }
                    : {}),
                },
              };
            });
          }}
        />
      )}

      <FlighteraProbe
        url="https://www.flightera.net/en/flight_details/VY2616/VY2616/AGP/2026-09-14"
        onData={(data) => {
          console.log(
            'FLIGHTERA PROBE RESULT:',
            JSON.stringify(data, null, 2),
          );
        }}
      />

      <ScrollView contentContainerStyle={styles.editContent} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Pressable onPress={onBack} style={styles.iconButton} accessibilityLabel="Volver"><Ionicons name="arrow-back" size={23} color={colors.ink} /></Pressable>
          <Text style={styles.headerTitle}>{initial ? 'Editar vuelo' : 'Nuevo vuelo'}</Text>
          <View style={styles.iconButton} />
        </View>
        <Text style={styles.editIntro}>Empieza con lo esencial. El resto puede esperar.</Text>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Tu vuelo</Text>
          <InputField label="Número de vuelo" value={draft.flightNumber} onChangeText={(value) => set('flightNumber', value)} placeholder="Por ejemplo, IB3170" autoCapitalize="characters" maxLength={12} />
          <Text style={styles.fieldLabel}>Fecha de salida</Text>
          <Pressable onPress={() => setShowDatePicker(true)} style={styles.dateButton}><Ionicons name="calendar-outline" size={20} color={colors.primary} /><Text style={styles.dateText}>{dateLabel(localDateKey(draft.flightDate))}</Text></Pressable>
          {showDatePicker && <DateTimePicker value={draft.flightDate} mode="date" display="default" onChange={(_, date) => {
            setShowDatePicker(false);
            if (date) setDraft((current) => ({ ...current, flightDate: date, fieldSources: {}, status: localDateKey(date) < localDateKey(new Date()) ? 'flown' : 'planned' }));
          }} />}
          <ActionButton
            label={lookupState === 'searching' ? 'Buscando vuelo�' : 'Buscar datos del vuelo'}
            onPress={searchFlight}
            disabled={lookupState === 'searching'}
            icon="search-outline"
          />
          
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
          <Text style={styles.fieldLabel}>Estado</Text>
          <View style={styles.segmentRow}>
            <Pressable onPress={() => set('status', 'flown')} style={[styles.segment, draft.status === 'flown' && styles.segmentActive]}><Text style={[styles.segmentText, draft.status === 'flown' && styles.segmentTextActive]}>Realizado</Text></Pressable>
            <Pressable onPress={() => set('status', 'planned')} style={[styles.segment, draft.status === 'planned' && styles.segmentActive]}><Text style={[styles.segmentText, draft.status === 'planned' && styles.segmentTextActive]}>Previsto</Text></Pressable>
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

            {(draft.actualDepartureAt ||
              draft.actualArrivalAt) && (
              <View
                style={{
                  flexDirection: 'row',
                  gap: 12,
                  marginBottom: 18,
                }}
              >
                <View
                  style={{
                    flex: 1,
                    backgroundColor: '#F5F8F7',
                    borderRadius: 16,
                    padding: 16,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: '#687574',
                      marginBottom: 5,
                    }}
                  >
                    Salida real
                  </Text>

                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: '700',
                      color: '#233130',
                    }}
                  >
                    {draft.actualDepartureAt
                      ?.match(/T(\d{2}:\d{2})/)?.[1] ||
                      '--:--'}
                  </Text>
                </View>

                <View
                  style={{
                    flex: 1,
                    backgroundColor: '#F5F8F7',
                    borderRadius: 16,
                    padding: 16,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: '#687574',
                      marginBottom: 5,
                    }}
                  >
                    Llegada real
                  </Text>

                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: '700',
                      color: '#233130',
                    }}
                  >
                    {draft.actualArrivalAt
                      ?.match(/T(\d{2}:\d{2})/)?.[1] ||
                      '--:--'}
                  </Text>
                </View>
              </View>
            )}

            <Text style={styles.fieldLabel}>Fecha de llegada</Text>
            <Pressable onPress={() => setShowArrivalPicker(true)} style={styles.dateButton}><Ionicons name="calendar-outline" size={20} color={colors.primary} /><Text style={styles.dateText}>{draft.arrivalDate ? dateLabel(draft.arrivalDate) : 'Sin especificar'}</Text></Pressable>
            {showArrivalPicker && <DateTimePicker value={draft.arrivalDate ? new Date(`${draft.arrivalDate}T12:00:00`) : draft.flightDate} mode="date" display="default" onChange={(_, date) => { setShowArrivalPicker(false); if (date) set('arrivalDate', localDateKey(date)); }} />}
            {Boolean(draft.arrivalDate) && <Pressable onPress={() => set('arrivalDate', '')}><Text style={styles.linkText}>Quitar fecha de llegada</Text></Pressable>}
            <InputField label="Duración en minutos" value={draft.durationMinutes} onChangeText={(value) => set('durationMinutes', value)} placeholder="Por ejemplo, 145" keyboardType="numeric" hint="Se usa para sumar tu tiempo en el aire." />

            {draft.distanceKm ? (
              <View
                style={{
                  marginTop: 16,
                  marginBottom: 4,
                  backgroundColor: '#F5F8F7',
                  borderRadius: 16,
                  padding: 16,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: '#687574',
                    marginBottom: 5,
                  }}
                >
                  Distancia del vuelo
                </Text>

                <Text
                  style={{
                    fontSize: 24,
                    fontWeight: '700',
                    color: '#233130',
                  }}
                >
                  {draft.distanceKm} km
                </Text>
              </View>
            ) : null}

          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>A bordo</Text>
            <InputField label="Modelo de avión" value={draft.aircraftModel} onChangeText={(value) => set('aircraftModel', value)} placeholder="Por ejemplo, Airbus A320" />
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
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [page, setPage] = useState<Page>('list');
  const [editing, setEditing] = useState<Flight | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supabase) { setBooting(false); return; }
    const client = supabase;
    client.auth.getSession().then(({ data }) => { setSession(data.session); setBooting(false); }).catch(() => setBooting(false));
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => { setSession(nextSession); if (!nextSession) { setFlights([]); setPage('list'); } });
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadFlights = useCallback(async () => {
    if (!supabase || !session) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('flights').select('*').order('flight_date', { ascending: false }).order('created_at', { ascending: false });
      if (error) throw error;
      setFlights((data ?? []) as Flight[]);
    } catch (error) {
      Alert.alert('No se pudieron cargar los vuelos', error instanceof Error ? error.message : 'Revisa tu conexión e inténtalo de nuevo.');
    } finally { setLoading(false); }
  }, [session]);

  useEffect(() => { if (session) void loadFlights(); }, [session, loadFlights]);

  function openNew() { setEditing(null); setPage('edit'); }
  function openEdit(flight: Flight) { setEditing(flight); setPage('edit'); }
  function back() { setPage('list'); setEditing(null); }

  async function save(draft: FlightDraft) {
    if (!supabase || !session) return;
    setSaving(true);
    try {
      const row = draftToRow(draft, session.user.id);
      const result = editing
        ? await supabase.from('flights').update(row).eq('id', editing.id).eq('user_id', session.user.id).select('id').single()
        : await supabase.from('flights').insert(row).select('id').single();
      if (result.error) throw result.error;
      back();
      await loadFlights();
    } catch (error) {
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Revisa tu conexión e inténtalo de nuevo.');
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!supabase || !session || !editing) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('flights').delete().eq('id', editing.id).eq('user_id', session.user.id);
      if (error) throw error;
      back();
      await loadFlights();
    } catch (error) {
      Alert.alert('No se pudo eliminar', error instanceof Error ? error.message : 'Revisa tu conexión e inténtalo de nuevo.');
    } finally { setSaving(false); }
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        {!isConfigured ? <SetupScreen /> : booting ? <ActivityIndicator style={styles.centered} color={colors.primary} /> : !session ? <AuthScreen /> : page === 'edit' ? (
          <EditScreen key={editing?.id ?? 'new'} initial={editing} onSave={save} onDelete={remove} onBack={back} busy={saving} />
        ) : (
          <ListScreen flights={flights} loading={loading} onRefresh={() => void loadFlights()} onAdd={openNew} onEdit={openEdit} onSignOut={() => void supabase?.auth.signOut()} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, safeArea: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', padding: 28 },
  logo: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  bigTitle: { fontSize: 33, fontWeight: '800', letterSpacing: -0.8, color: colors.ink },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 9 },
  authContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 34 },
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: colors.line },
  authCard: { marginTop: 30 },
  sectionTitle: { color: colors.ink, fontSize: 19, fontWeight: '700', marginBottom: 18 },
  field: { marginBottom: 16 }, fieldLabel: { color: colors.ink, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { minHeight: 52, backgroundColor: '#F7FAF9', borderColor: colors.line, borderWidth: 1, borderRadius: 15, paddingHorizontal: 15, color: colors.ink, fontSize: 16 },
  inputMultiline: { minHeight: 92, paddingTop: 14, textAlignVertical: 'top' },
  fieldHint: { color: colors.muted, fontSize: 12, marginTop: 6 },
  button: { minHeight: 54, backgroundColor: colors.primary, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 18 },
  buttonSecondary: { backgroundColor: colors.primarySoft }, buttonDimmed: { opacity: 0.65 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' }, buttonTextSecondary: { color: colors.primary },
  switchAuth: { alignItems: 'center', padding: 18 }, linkText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  noticeCard: { backgroundColor: colors.surface, borderRadius: 22, padding: 20, marginTop: 30 }, noticeTitle: { color: colors.ink, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 }, bodyCentered: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  listContent: { padding: 20, paddingBottom: 45 }, headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 21 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.6, color: colors.primary, marginBottom: 5 },
  iconButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  heroCard: { backgroundColor: colors.sky, borderRadius: 26, padding: 22, marginBottom: 14 },
  heroCircle: { width: 49, height: 49, borderRadius: 17, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  heroTitle: { fontSize: 23, fontWeight: '800', color: colors.ink, marginBottom: 8 },
  heroText: { fontSize: 15, lineHeight: 22, color: colors.muted, marginBottom: 21 },
  statsRow: { flexDirection: 'row', gap: 9, marginBottom: 27 },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 19, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.line },
  statValue: { fontSize: 21, fontWeight: '800', color: colors.ink }, statLabel: { color: colors.muted, fontSize: 11, marginTop: 3 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingHorizontal: 2 },
  flightCard: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 18, marginBottom: 12 },
  flightTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  flightNumberPill: { backgroundColor: colors.primarySoft, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 },
  flightNumberText: { color: colors.primary, fontSize: 13, fontWeight: '800' }, flightDate: { color: colors.muted, fontSize: 13 },
  routeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 23, marginBottom: 19 },
  routeCode: { color: colors.ink, fontSize: 23, fontWeight: '800', minWidth: 76 },
  routeLine: { flex: 1, flexDirection: 'row', alignItems: 'center', marginHorizontal: 10, gap: 4 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary }, line: { flex: 1, height: 1, backgroundColor: '#B6D5D4' },
  flightBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  flightMeta: { flex: 1, color: colors.muted, fontSize: 13 },
  statusPill: { backgroundColor: colors.primarySoft, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  statusPlanned: { backgroundColor: colors.amber }, statusText: { color: colors.ink, fontSize: 11, fontWeight: '600' },
  emptyCard: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 24, padding: 30, gap: 10 },
  emptyTitle: { color: colors.ink, fontSize: 18, fontWeight: '700' }, footnote: { color: colors.muted, fontSize: 11, marginTop: 8 }, loader: { marginVertical: 30 },
  editContent: { padding: 20, paddingBottom: 50 }, headerTitle: { color: colors.ink, fontSize: 19, fontWeight: '700' },
  editIntro: { color: colors.muted, fontSize: 15, marginBottom: 21 },
  dateButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, borderRadius: 15, backgroundColor: '#F7FAF9', borderWidth: 1, borderColor: colors.line, marginBottom: 18 },
  dateText: { color: colors.ink, fontSize: 16 },
  segmentRow: { flexDirection: 'row', backgroundColor: '#F7FAF9', padding: 4, borderRadius: 15 },
  segment: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  segmentActive: { backgroundColor: colors.primary }, segmentText: { color: colors.muted, fontWeight: '600' }, segmentTextActive: { color: '#FFFFFF' },
  expandButton: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, padding: 15, marginBottom: 5 },
  expandText: { color: colors.primary, fontSize: 15, fontWeight: '700' }, twoCols: { flexDirection: 'row', gap: 12 }, col: { flex: 1 },
  deleteButton: { alignItems: 'center', padding: 20 }, deleteText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
  lookupMessage: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 16 },
  lookupBox: { borderRadius: 18, backgroundColor: colors.primarySoft, padding: 15, marginBottom: 18 },
  lookupTitle: { color: colors.ink, fontSize: 15, fontWeight: '700', marginBottom: 8 },
  lookupOption: { backgroundColor: colors.surface, borderRadius: 13, padding: 12, marginBottom: 7 },
  lookupOptionMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lookupRoute: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  lookupText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 7 },
  lookupHint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
});

