// Formatting helpers shared by the admin schedule, the class screens and the
// member timetable so a session reads identically everywhere.
//
// A date-only value is parsed as LOCAL midnight (no trailing Z) so the calendar
// day never shifts backwards in a positive-offset timezone like Malaysia.

import { LEVEL_LABEL } from '@/lib/studentFormat';

export const CLASS_STATUS_LABEL = {
  scheduled: 'Scheduled',
  cancelled: 'Cancelled',
  completed: 'Completed'
};

export const CLASS_STATUS_STYLE = {
  scheduled: 'bg-brand text-brand-foreground',
  cancelled: 'bg-muted text-muted-foreground',
  completed: 'bg-muted text-muted-foreground'
};

export const CANCELLATION_TYPE_LABEL = {
  normal: 'Normal cancellation',
  academy: 'Academy cancellation'
};

function toLocalDate(value) {
  if (!value) return null;
  const parsed = new Date(value.length <= 10 ? value + 'T00:00:00' : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function shortDate(value) {
  const date = toLocalDate(value);
  if (!date) return '—';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function classDate(value) {
  const date = toLocalDate(value);
  if (!date) return '—';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

export function dayHeading(value) {
  const date = toLocalDate(value);
  if (!date) return '—';
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}

export function weekdayShort(value) {
  const date = toLocalDate(value);
  if (!date) return '';
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

// "10:00" -> "10:00 AM"
export function timeLabel(value) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return '—';
  const [hours, minutes] = value.split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

export function timeRange(start, end) {
  if (!start && !end) return 'Time not set';
  if (!end) return timeLabel(start);
  return `${timeLabel(start)} – ${timeLabel(end)}`;
}

// 0 = Sunday, matching the stored ClassGroup.day_of_week.
export const DAY_OF_WEEK_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
];

export function dayOfWeekLabel(value) {
  return DAY_OF_WEEK_LABELS[value] || 'Weekly';
}

export function levelLabel(level) {
  return LEVEL_LABEL[level] || 'Level not set';
}

export const CLASS_CATEGORY_LABEL = {
  toddler: 'Toddler',
  standard: 'Standard',
  adult: 'Adult'
};

// How a class reads to staff and members. Toddler and Adult are categories, not
// levels, so a null level never surfaces:
//   toddler  -> 'Toddler'
//   standard -> 'Standard · Beginner'
//   adult    -> 'Adult · Beginner' or 'Adult · Mixed levels'
export function classTypeLabel(category, level) {
  if (category === 'toddler') return 'Toddler';
  const label = LEVEL_LABEL[level] || null;
  if (category === 'adult') return label ? `Adult · ${label}` : 'Adult · Mixed levels';
  return label ? `Standard · ${label}` : 'Standard';
}

export function classStatusLabel(status) {
  return CLASS_STATUS_LABEL[status] || status || 'Scheduled';
}

export function classStatusStyle(status) {
  return CLASS_STATUS_STYLE[status] || CLASS_STATUS_STYLE.scheduled;
}

export function cancellationTypeLabel(type) {
  return CANCELLATION_TYPE_LABEL[type] || 'Cancelled';
}

// "Today" / "Tomorrow" when it matches, so a member can answer "what is on this
// week" at a glance.
export function relativeDayLabel(value, today) {
  const date = toLocalDate(value);
  const base = toLocalDate(today);
  if (!date || !base) return null;
  const diff = Math.round((date - base) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return null;
}

export function groupByDay(classes) {
  const groups = [];
  (classes || []).forEach((item) => {
    const key = item.date || '';
    const last = groups[groups.length - 1];
    if (last && last.date === key) last.classes.push(item);
    else groups.push({ date: key, classes: [item] });
  });
  return groups;
}

export function capacityLabel(capacity) {
  if (typeof capacity !== 'number') return 'Capacity not set';
  return `Capacity: ${capacity}`;
}