from pathlib import Path
import re

path = Path("App.tsx")
text = path.read_text(encoding="utf-8-sig")

import_line = """import {
  isRecentPlaneFinderDate,
  PlaneFinderProbe,
} from './src/components/PlaneFinderProbe';
"""

if "from './src/components/PlaneFinderProbe'" not in text:
    marker = "import { FlighteraProbe } from './src/components/FlighteraProbe';\n"
    if marker not in text:
        raise RuntimeError("FlighteraProbe import not found")
    text = text.replace(marker, marker + import_line, 1)

state_marker = """  const [suggestions, setSuggestions]"""
state_pos = text.find(state_marker)

if state_pos == -1:
    raise RuntimeError("suggestions state not found")

line_start = text.rfind("\n", 0, state_pos) + 1

if "allowPlaneFinderProbe" not in text:
    state_line_end = text.find("\n", state_pos)
    insertion = """
  const [allowPlaneFinderProbe, setAllowPlaneFinderProbe] =
    useState(false);
"""
    text = text[:state_line_end + 1] + insertion + text[state_line_end + 1:]

old_choose = """  function chooseSuggestion(item: LookupSuggestion) {
    setDraft((current) => applySuggestion(current, item));
    setSuggestions([]);
    setDetails(true);
  }
"""

new_choose = """  function chooseSuggestion(item: LookupSuggestion) {
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
"""

if old_choose not in text:
    raise RuntimeError("chooseSuggestion block not found")

text = text.replace(old_choose, new_choose, 1)

anchor = """      {/* FLIGHTERA_LIVE_PROBE */}"""

if anchor not in text:
    raise RuntimeError("FLIGHTERA_LIVE_PROBE anchor not found")

probe = """      {allowPlaneFinderProbe &&
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

"""

if "<PlaneFinderProbe" not in text:
    text = text.replace(anchor, probe + anchor, 1)

path.write_text(text, encoding="utf-8")
print("App.tsx actualizado")
