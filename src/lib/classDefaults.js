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
export function suggestedCapacity(category, level) {
  if (category === 'toddler') return 3;
  if (category === 'adult') return 6;
  return STANDARD_CAPACITY[level] || 6;
}

// Toddler sessions run 30 minutes, everything else around 55.
export function suggestedEndTime(startTime, category) {
  if (typeof startTime !== 'string' || !/^\d{2}:\d{2}$/.test(startTime)) return '';
  const duration = category === 'toddler' ? 30 : 55;
  const [hours, minutes] = startTime.split(':').map(Number);
  const total = hours * 60 + minutes + duration;
  if (total >= 24 * 60) return '';
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}