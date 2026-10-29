// Category / level suggestions shown in the class forms.
//
// These come from what the academy actually runs, but they are DEFAULTS ONLY: the
// admin may always overwrite capacity and end time, and nothing here is enforced on
// the server.

export const CLASS_CATEGORY_OPTIONS = [
  { value: 'toddler', label: 'Toddler' },
  { value: 'standard', label: 'Standard' },
  { value: 'adult', label: 'Adult' }
];

export const LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' }
];

const STANDARD_CAPACITY = { beginner: 5, intermediate: 6, advanced: 8 };

// Toddler 3, Beginner 5, Intermediate 6, Advanced 8, Adult 6.
// No suggestion at all until the admin has chosen a category (and, for Standard,
// a level): a suggestion is never used to imply a category choice.
export function suggestedCapacity(category, level) {
  if (category === 'toddler') return 3;
  if (category === 'adult') return 6;
  if (category === 'standard') return STANDARD_CAPACITY[level] || '';
  return '';
}

// Follow a suggestion only while the field is blank or still holds the PREVIOUS
// suggestion. A value the admin typed themselves is never overwritten.
export function applySuggestion(currentValue, previousSuggestion, nextSuggestion) {
  if (nextSuggestion === '' || nextSuggestion === null || nextSuggestion === undefined) {
    return currentValue;
  }
  const blank = currentValue === '' || currentValue === null || currentValue === undefined;
  const untouched =
    previousSuggestion !== '' &&
    previousSuggestion !== null &&
    previousSuggestion !== undefined &&
    String(currentValue) === String(previousSuggestion);
  if (blank || untouched) return nextSuggestion;
  return currentValue;
}

// --- Form tracking ---------------------------------------------------------
// The Class Group form keeps, beside each field, the suggestion that field is
// currently following (suggested_capacity / suggested_end). These helpers return
// the patch for that pair: a suggestion is only followed while it is still the
// value on screen, so a value the admin typed is never overwritten.

export function followCapacity(current, category, level) {
  const next = suggestedCapacity(category, level);
  const previous = current.suggested_capacity;
  return {
    max_capacity: applySuggestion(current.max_capacity, previous, next),
    // An empty suggestion keeps the previous one alive: switching from Toddler to a
    // Standard group that has no level yet must not lose the 3 it was following.
    suggested_capacity: next === '' ? previous : next
  };
}

export function followEndTime(current, startTime, category, isNew) {
  if (!isNew) return { end_time: current.end_time, suggested_end: current.suggested_end };
  const next = suggestedEndTime(startTime, category);
  const previous = current.suggested_end;
  return {
    end_time: applySuggestion(current.end_time, previous, next),
    suggested_end: next === '' ? previous : next
  };
}

// Toddler sessions run 30 minutes, everything else around 55.
export function suggestedEndTime(startTime, category) {
  if (typeof startTime !== 'string' || !/^\d{2}:\d{2}$/.test(startTime)) return '';
  if (category !== 'toddler' && category !== 'standard' && category !== 'adult') return '';
  const duration = category === 'toddler' ? 30 : 55;
  const [hours, minutes] = startTime.split(':').map(Number);
  const total = hours * 60 + minutes + duration;
  if (total >= 24 * 60) return '';
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}