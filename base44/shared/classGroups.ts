// Server-only rules for a Class Group: the recurring weekly identity behind a set
// of dated Class sessions.
//
// A ClassGroup is NOT a session. It holds the weekly shape (weekday, times, venue,
// coach, level, capacity); Class records stay the single dated sessions that
// attendance, tokens and history attach to.
//
// Editing a group NEVER rewrites a session that already exists. Generation reads
// the group's current values, so a changed coach or time only affects sessions
// created afterwards — an individual session may also differ from its group
// without touching the series.

import {
  LEVEL_LABELS,
  DAY_OF_WEEK_LABELS,
  dayOfWeekOfDate,
  addDays
} from './classAccess.ts';

export const MAX_GROUP_NOTES_LENGTH = 300;
export const MAX_GENERATION_RANGE_DAYS = 180;
export const MAX_GENERATED_SESSIONS = 60;

// Every date in [from, to] that falls on dayOfWeek (0 = Sunday): one session per
// matching week. Deliberately no monthly rules, no recurrence syntax, no
// exceptions engine.
export function weeklySessionDates(fromDate, toDate, dayOfWeek) {
  const dates = [];
  let cursor = fromDate;
  // The loop is bounded by the caller's validated range; the guard only stops a
  // runaway if that check is ever loosened.
  for (let guard = 0; cursor <= toDate && guard <= MAX_GENERATION_RANGE_DAYS; guard += 1) {
    if (dayOfWeekOfDate(cursor) === dayOfWeek) dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

// "Beginner Saturday" — used when the admin leaves the label blank.
export function defaultGroupName(level, dayOfWeek) {
  return `${LEVEL_LABELS[level] || 'Swimming'} ${DAY_OF_WEEK_LABELS[dayOfWeek] || ''}`.trim();
}

// Admin projection. Internal ids are acceptable because the viewer is authorized
// for the record. Never used for members: they only ever see dated sessions.
export function projectClassGroup(group, ctx) {
  const locationId = group.location_id || null;
  const branchId = group.branch_id || null;
  const coachId = group.coach_id || null;
  return {
    id: group.id,
    name: group.name || null,
    level: group.skill_level || null,
    level_label: LEVEL_LABELS[group.skill_level] || null,
    day_of_week: typeof group.day_of_week === 'number' ? group.day_of_week : null,
    day_label: DAY_OF_WEEK_LABELS[group.day_of_week] || null,
    start_time: group.start_time || null,
    end_time: group.end_time || null,
    capacity: typeof group.max_capacity === 'number' ? group.max_capacity : null,
    is_active: group.is_active !== false,
    notes: group.notes || null,
    location: { id: locationId, name: locationId ? ctx.locationNames[locationId] || null : null },
    branch: { id: branchId, name: branchId ? ctx.branchNames[branchId] || null : null },
    coach: coachId
      ? {
          id: coachId,
          name: ctx.coachNames[coachId] || null,
          has_active_coach_role: ctx.activeCoachIds.has(coachId)
        }
      : null
  };
}