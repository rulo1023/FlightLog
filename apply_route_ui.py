from pathlib import Path
import re

# ------------------------------------------------------------
# flights.ts
# ------------------------------------------------------------

path = Path("src/lib/flights.ts")
text = path.read_text(encoding="utf-8-sig")

if "distance_km:" not in text:
    text = text.replace(
        "  duration_minutes: number | null;",
        "  duration_minutes: number | null;\n"
        "  distance_km: number | null;"
    )

if "distanceKm: string;" not in text:
    text = text.replace(
        "  durationMinutes: string;",
        "  durationMinutes: string;\n"
        "  distanceKm: string;"
    )

if "distanceKm: ''," not in text:
    text = text.replace(
        "durationMinutes: '',",
        "durationMinutes: '', distanceKm: '',",
        1
    )

if "distanceKm: flight.distance_km" not in text:
    text = text.replace(
        "durationMinutes: flight.duration_minutes?.toString() ?? '',",
        "durationMinutes: flight.duration_minutes?.toString() ?? '',\n"
        "    distanceKm: flight.distance_km?.toString() ?? '',"
    )

if "distance_km: draft.distanceKm" not in text:
    text = text.replace(
        "duration_minutes: draft.durationMinutes ? Number(draft.durationMinutes) : null,",
        "duration_minutes: draft.durationMinutes ? Number(draft.durationMinutes) : null,\n"
        "    distance_km: draft.distanceKm ? Number(draft.distanceKm) : null,"
    )

path.write_text(text, encoding="utf-8")


# ------------------------------------------------------------
# lookup.ts
# ------------------------------------------------------------

path = Path("src/lib/lookup.ts")
text = path.read_text(encoding="utf-8-sig")

if "fieldSources.distanceKm" not in text:
    anchor = "  if (suggestion.aircraftModel) {"

    insert = """
  if (suggestion.distanceKm != null) {
    fieldSources.distanceKm =
      source;
  }

"""

    text = text.replace(
        anchor,
        insert + anchor,
        1
    )

if "suggestion.distanceKm != null" not in text[text.find("return {", text.find("export function applySuggestion")):]:
    anchor = """    durationMinutes:
      suggestion.durationMinutes != null
        ? String(
            suggestion.durationMinutes,
          )
        : draft.durationMinutes,
"""

    replacement = anchor + """
    distanceKm:
      suggestion.distanceKm != null
        ? String(
            suggestion.distanceKm,
          )
        : draft.distanceKm,
"""

    text = text.replace(
        anchor,
        replacement,
        1
    )

path.write_text(text, encoding="utf-8")


# ------------------------------------------------------------
# App.tsx
# ------------------------------------------------------------

path = Path("App.tsx")
text = path.read_text(encoding="utf-8-sig")

map_import = (
    "import { FlightRouteMap } "
    "from './src/components/FlightRouteMap';\n"
)

if "FlightRouteMap" not in text:
    text = map_import + text


# Eliminar el bloque roto de horas y sustituirlo entero.
pattern = re.compile(
    r"""
    \s*<View\s+style=\{styles\.twoCols\}>
    \s*<View\s+style=\{styles\.col\}>
    <InputField\s+label="Hora\s+de\s+salida"
    [\s\S]*?
    <Text\s+style=\{styles\.fieldLabel\}>
    Fecha\s+de\s+llegada
    </Text>
    """,
    re.X
)

replacement = r'''
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
                  marginTop: 6,
                  marginBottom: 18,
                }}
              >
                <View
                  style={{
                    flex: 1,
                    padding: 14,
                    borderRadius: 16,
                    backgroundColor: '#F5F8F7',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      opacity: 0.65,
                      marginBottom: 4,
                    }}
                  >
                    Salida real
                  </Text>

                  <Text
                    style={{
                      fontSize: 22,
                      fontWeight: '700',
                    }}
                  >
                    {draft.actualDepartureAt
                      ?.match(
                        /T(\d{2}:\d{2})/,
                      )?.[1] || '--:--'}
                  </Text>
                </View>

                <View
                  style={{
                    flex: 1,
                    padding: 14,
                    borderRadius: 16,
                    backgroundColor: '#F5F8F7',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      opacity: 0.65,
                      marginBottom: 4,
                    }}
                  >
                    Llegada real
                  </Text>

                  <Text
                    style={{
                      fontSize: 22,
                      fontWeight: '700',
                    }}
                  >
                    {draft.actualArrivalAt
                      ?.match(
                        /T(\d{2}:\d{2})/,
                      )?.[1] || '--:--'}
                  </Text>
                </View>
              </View>
            )}

            <Text style={styles.fieldLabel}>
              Fecha de llegada
            </Text>
'''

text, count = pattern.subn(
    replacement,
    text,
    count=1
)

if count == 0:
    raise RuntimeError(
        "No pude localizar el bloque de horas en App.tsx"
    )


# A?adir distancia + mapa despu?s de duraci?n.
if "Distancia del vuelo" not in text:
    duration_pattern = re.compile(
        r"""
        (<InputField
        \s+label="Duraci[o?]n\s+en\s+minutos"
        [\s\S]*?
        />)
        """,
        re.X
    )

    extra = r'''\1

            {draft.distanceKm ? (
              <View
                style={{
                  marginTop: 14,
                  padding: 16,
                  borderRadius: 16,
                  backgroundColor: '#F5F8F7',
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    opacity: 0.65,
                    marginBottom: 4,
                  }}
                >
                  Distancia del vuelo
                </Text>

                <Text
                  style={{
                    fontSize: 24,
                    fontWeight: '700',
                  }}
                >
                  {draft.distanceKm} km
                </Text>
              </View>
            ) : null}

            {draft.departureCode &&
             draft.arrivalCode ? (
              <FlightRouteMap
                departureCode={
                  draft.departureCode
                }
                arrivalCode={
                  draft.arrivalCode
                }
              />
            ) : null}
'''

    text, count = duration_pattern.subn(
        extra,
        text,
        count=1
    )

    if count == 0:
        raise RuntimeError(
            "No pude localizar Duracion en minutos"
        )

path.write_text(text, encoding="utf-8")

print("OK flights.ts")
print("OK lookup.ts")
print("OK App.tsx")
