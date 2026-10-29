// Server-only rules for the Swimflow class timetable (venues, sessions, conflicts,
// projections). Shared by listClasses / getClass / saveClass / cancelClass /
// getScheduleOptions / saveLocation / listMemberClasses so the timetable rules
// exist in exactly one place.
//
// Authorization note: nothing here trusts a branch id, venue id or coach id sent by
// the browser. A caller passes ids; this module resolves what they actually are
// (venue -> branch, coach -> active Coach role) and the caller compares the result
// with the Admin branch scope resolved in adminScope.ts.

import { asArray } from './studentProfile.ts';
import { jsonError } from './directoryAccess.ts';
import { getActiveAssignment, resolveUserMap } from './academyRoles.ts';

// The academy operates in Malaysian time. "Today" is resolved in this zone so an
// evening session never drops out of "upcoming" eight hours early.
export const ACADEMY_TIME_ZONE = 'Asia/Kuala_Lumpur';

export const LEVELS = ['beginner', 'intermediate', 'advanced'];
export const LEVEL_LABELS = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced'
};

// Cancellation types exist now so later token logic can distinguish an ordinary
// cancellation from an academy-wide closure without a migration. Any further detail
// (why the academy closed) belongs in the free-text cancellation_reason.
export const CANCELLATION_TYPES = ['normal', 'academy'];
export const CANCELLATION_TYPE_LABELS = {
  normal: 'Normal cancellation',
  academy: 'Academy cancellation'
};

export const CLASS_STATUSES = ['scheduled', 'completed', 'cancelled'];

export const MIN_CAPACITY = 1;
export const MAX_CAPACITY = 60;
export const MAX_CLASS_WINDOW_DAYS = 180;
export const DEFAULT_CLASS_PAGE_SIZE = 30;
export const MAX_CLASS_PAGE_SIZE = 100;
export const MAX_NAME_LENGTH = 80;
export const MAX_NOTES_LENGTH = 500;
export const MAX_REASON_LENGTH = 200;
export const MAX_ADDRESS_LENGTH = 200;
export const MAX_LOCATION_NOTES_LENGTH = 300;
export const MEMBER_MAX_WINDOW_DAYS = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// ---------------------------------------------------------------- roles / gate

// One Role query for every role name, reused inside a single request. The existing
// directory functions each look the admin role up separately; the timetable
// functions need several role names (admin + coach), so they share one cache
// instead of issuing one Role filter per name.
export function createRoleCache(base44) {
  let pending = null;
  const load = async () => {
    const page = await base44.asServiceRole.entities.Role.list('-created_date', 50);
    const byName = {};
    asArray(page).forEach((role) => {
      if (role && role.name) byName[role.name] = role;
    });
    return byName;
  };
  return {
    async get(name) {
      if (!pending) pending = load();
      const byName = await pending;
      return byName[name] || null;
    }
  };
}

// Academy-Admin gate using the shared role cache. Same rule as
// authorizeAcademyAdmin: an active academy-admin UserRole assignment, resolved
// server-side, never the platform User.role.
export async function authorizeAcademyAdminWithCache(base44, user, roles) {
  const adminRole = await roles.get('admin');
  if (!adminRole) return { error: jsonError(500, 'Academy roles are not configured') };
  const assignment = await getActiveAssignment(base44, user.id, adminRole.id);
  if (!assignment) return { error: jsonError(403, 'Admins only') };
  return { assignment };
}

// ---------------------------------------------------------------- date / time

export function todayInAcademyZone() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ACADEMY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

export function addDays(dateValue, days) {
  const base = new Date(dateValue + 'T00:00:00Z');
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function daysBetween(fromDate, toDate) {
  const a = Date.parse(fromDate + 'T00:00:00Z');
  const b = Date.parse(toDate + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86400000);
}

export function requireDate(value, field) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    return { error: jsonError(400, `${field} must be a date in YYYY-MM-DD format`) };
  }
  const parsed = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return { error: jsonError(400, `${field} is not a real calendar date`) };
  }
  return { value };
}

export function requireTime(value, field) {
  if (typeof value !== 'string' || !TIME_RE.test(value)) {
    return { error: jsonError(400, `${field} must be a time in HH:MM format`) };
  }
  return { value };
}

// Minutes since midnight, or null when the stored value is unusable.
export function minutesOf(value) {
  if (typeof value !== 'string' || !TIME_RE.test(value)) return null;
  const parts = value.split(':');
  return Number(parts[0]) * 60 + Number(parts[1]);
}

// ---------------------------------------------------------------- weekday

// 0 = Sunday, matching Date#getUTCDay(). A Class Group recurs on exactly one
// weekday, so the day is stored as a number and labelled here once.
export const DAY_OF_WEEK_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
];

export function requireDayOfWeek(value) {
  const numeric = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 6) {
    return { error: jsonError(400, 'day_of_week must be a whole number from 0 (Sunday) to 6 (Saturday)') };
  }
  return { value: numeric };
}

// The weekday of a YYYY-MM-DD value, read in UTC so the calendar day never shifts
// in a positive-offset timezone like Malaysia.
export function dayOfWeekOfDate(dateValue) {
  const parsed = new Date(dateValue + 'T00:00:00Z');
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getUTCDay();
}

// ---------------------------------------------------------------- input values

export function requireId(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    return { error: jsonError(400, `${field} is required`) };
  }
  return { value: value.trim() };
}

export function optionalId(value, field) {
  if (value === undefined || value === null) return { value: null };
  if (typeof value !== 'string') return { error: jsonError(400, `${field} must be text`) };
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'none') return { value: null };
  return { value: trimmed };
}

export function optionalText(value, field, max) {
  if (value === undefined || value === null) return { value: null };
  if (typeof value !== 'string') return { error: jsonError(400, `${field} must be text`) };
  const trimmed = value.trim();
  if (!trimmed) return { value: null };
  if (trimmed.length > max) {
    return { error: jsonError(400, `${field} must be ${max} characters or fewer`) };
  }
  return { value: trimmed };
}

export function requireCapacity(value) {
  const numeric = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof numeric !== 'number' || !Number.isInteger(numeric)) {
    return {
      error: jsonError(400, `Capacity must be a whole number between ${MIN_CAPACITY} and ${MAX_CAPACITY}`)
    };
  }
  if (numeric < MIN_CAPACITY || numeric > MAX_CAPACITY) {
    return { error: jsonError(400, `Capacity must be between ${MIN_CAPACITY} and ${MAX_CAPACITY}`) };
  }
  return { value: numeric };
}

export function requireLevel(value) {
  if (typeof value !== 'string' || !LEVELS.includes(value)) {
    return { error: jsonError(400, 'Level must be one of ' + LEVELS.join(', ')) };
  }
  return { value };
}

export function parseClassStatusFilter(value) {
  if (value === undefined || value === null || value === '' || value === 'all') return { value: null };
  if (typeof value !== 'string' || !CLASS_STATUSES.includes(value)) {
    return { error: jsonError(400, 'status must be one of ' + CLASS_STATUSES.join(', ')) };
  }
  return { value };
}

export function parseCancellationType(value) {
  if (typeof value !== 'string' || !CANCELLATION_TYPES.includes(value)) {
    return { error: jsonError(400, 'cancellation_type must be one of ' + CANCELLATION_TYPES.join(', ')) };
  }
  return { value };
}

export function parseClassPageSize(value) {
  if (value === undefined || value === null || value === '') return { value: DEFAULT_CLASS_PAGE_SIZE };
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1) {
    return { error: jsonError(400, 'limit must be a positive integer') };
  }
  return { value: Math.min(numeric, MAX_CLASS_PAGE_SIZE) };
}

export function displayName(user) {
  if (!user) return null;
  return user.full_name || user.display_name || user.email || null;
}

// ---------------------------------------------------------------- venue / coach options

// Venues inside the caller's authorized branches, with the branch name attached.
// Inactive venues are included (staff still need to read historical classes) but
// the screens only offer active ones for new classes.
export async function loadAdminLocations(base44, scope) {
  const branchNames = {};
  (scope.branches || []).forEach((branch) => {
    branchNames[branch.id] = branch.name;
  });
  const page = await base44.asServiceRole.entities.Location.filter(
    { branch_id: { $in: scope.branchIds } },
    { limit: 200 }
  );
  return asArray(page)
    .map((venue) => ({
      id: venue.id,
      name: venue.name || null,
      address: venue.address || null,
      notes: venue.notes || null,
      branch_id: venue.branch_id || null,
      branch_name: branchNames[venue.branch_id] || null,
      is_active: venue.is_active !== false
    }))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

// Users holding an active Coach role. This is a picker list only — a class is
// never trusted to reference a coach because the picker offered them.
export async function loadAdminCoaches(base44, roles) {
  const coachRole = await roles.get('coach');
  if (!coachRole) return [];
  const page = await base44.asServiceRole.entities.UserRole.filter(
    { role_id: coachRole.id, is_active: true },
    { limit: 200 }
  );
  const ids = [...new Set(asArray(page).map((row) => row.user_id).filter(Boolean))];
  if (!ids.length) return [];
  const users = await resolveUserMap(base44, ids);
  return ids
    .filter((id) => Boolean(users[id]))
    .map((id) => ({ user_id: id, name: displayName(users[id]) }))
    .filter((coach) => Boolean(coach.name))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

// Resolve a venue the caller may actually schedule in: it must exist, be active
// (unless history-only reading is wanted) and sit inside the Admin's own branch
// scope. The branch is taken from the venue, never from the browser.
export async function resolveAuthorizedVenue(base44, locationId, scope, options) {
  const venue = await getRecordOrNull(base44, 'Location', locationId);
  if (!venue) {
    return { error: jsonError(400, 'That venue could not be found. Choose a venue from the list.') };
  }
  if ((options && options.requireActive !== false) && venue.is_active === false) {
    return { error: jsonError(400, 'That venue is inactive. Choose an active venue.') };
  }
  if (!venue.branch_id) {
    return { error: jsonError(400, 'That venue is not linked to a branch yet.') };
  }
  if (!scope.branchIds.includes(venue.branch_id)) {
    return { error: jsonError(403, 'That venue is not in your administrator scope') };
  }
  return { venue };
}

// Resolve a coach who may be assigned: the User must exist AND hold an active
// Coach role. A picker offering someone is never proof they still hold it.
export async function resolveActiveCoach(base44, roles, coachId) {
  const coachUser = await getRecordOrNull(base44, 'User', coachId);
  if (!coachUser) return { error: jsonError(400, 'That coach could not be found.') };
  const coachRole = await roles.get('coach');
  const assignment = coachRole ? await getActiveAssignment(base44, coachId, coachRole.id) : null;
  if (!assignment) {
    return { error: jsonError(400, 'That person does not have an active Coach role.') };
  }
  return { user: coachUser };
}

// ---------------------------------------------------------------- conflicts

// Overlap check for ONE coach across one or more dates.
//
// A coach is the only scheduling constraint. The academy deliberately runs
// several classes at the same pool at the same time (one per coach on duty), so
// a shared venue is normal and never blocks a write.
//
// One query, however many dates are passed, so weekly session generation checks
// the whole range at once instead of once per date.
export async function findCoachConflicts(base44, input) {
  const dates = Array.isArray(input.class_dates)
    ? [...new Set(input.class_dates.filter(Boolean))]
    : [input.class_date].filter(Boolean);
  if (!input.coach_id || !dates.length) return [];

  const page = await base44.asServiceRole.entities.Class.filter(
    {
      coach_id: input.coach_id,
      status: 'scheduled',
      class_date: dates.length === 1 ? dates[0] : { $in: dates }
    },
    { limit: 200 }
  );
  const start = minutesOf(input.start_time);
  const end = minutesOf(input.end_time);

  return asArray(page).filter((row) => {
    if (!row || row.id === input.exclude_id) return false;
    const rowStart = minutesOf(row.start_time);
    const rowEnd = minutesOf(row.end_time);
    if (rowStart === null || rowEnd === null || start === null || end === null) return false;
    return start < rowEnd && end > rowStart;
  });
}

export function summariseConflicts(rows) {
  return (rows || []).slice(0, 5).map((row) => ({
    date: row.class_date || null,
    start_time: row.start_time || null,
    end_time: row.end_time || null,
    name: row.name || null,
    level_label: LEVEL_LABELS[row.skill_level] || null
  }));
}

// The single decision point for scheduling conflicts, shared by saveClass and
// cancelClass(restore) so the rule cannot drift into two versions:
//   a coach may not be in two places at once -> hard refusal (409)
//
// Venue overlap is deliberately NOT a conflict: the academy runs several classes
// at the same pool at the same time, the number depending on how many coaches are
// on duty. Staffing is not hard-coded, so no venue rule replaces it.
//
// Returns a ready Response to send, or null when nothing blocks the write.
export function coachConflictResponse(conflicts) {
  if (!conflicts || !conflicts.length) return null;
  return Response.json(
    {
      error: 'That coach already teaches another class at this time.',
      conflicts: summariseConflicts(conflicts)
    },
    { status: 409 }
  );
}

// ---------------------------------------------------------------- projections

export function buildClassContext(base44Names) {
  return {
    locationNames: base44Names.locationNames || {},
    branchNames: base44Names.branchNames || {},
    coachNames: base44Names.coachNames || {},
    activeCoachIds: base44Names.activeCoachIds || new Set(),
    today: base44Names.today || todayInAcademyZone()
  };
}

// Admin view: internal ids are acceptable here because the viewer is authorized
// for the whole record they are looking at.
export function projectAdminClass(cls, ctx) {
  const locationId = cls.location_id || null;
  const branchId = cls.branch_id || null;
  const coachId = cls.coach_id || null;
  const cancelled = cls.status === 'cancelled';
  return {
    id: cls.id,
    name: cls.name || null,
    date: cls.class_date || null,
    start_time: cls.start_time || null,
    end_time: cls.end_time || null,
    level: cls.skill_level || null,
    level_label: LEVEL_LABELS[cls.skill_level] || null,
    capacity: typeof cls.max_capacity === 'number' ? cls.max_capacity : null,
    status: cls.status || 'scheduled',
    notes: cls.notes || null,
    class_group_id: cls.class_group_id || null,
    is_past: Boolean(cls.class_date && cls.class_date < ctx.today),
    location: { id: locationId, name: locationId ? ctx.locationNames[locationId] || null : null },
    branch: { id: branchId, name: branchId ? ctx.branchNames[branchId] || null : null },
    coach: coachId
      ? {
          id: coachId,
          name: ctx.coachNames[coachId] || null,
          has_active_coach_role: ctx.activeCoachIds.has(coachId)
        }
      : null,
    cancellation: cancelled
      ? {
          at: cls.cancelled_at || null,
          type: cls.cancellation_type || null,
          type_label: CANCELLATION_TYPE_LABELS[cls.cancellation_type] || null,
          reason: cls.cancellation_reason || null
        }
      : null
  };
}

// Member view: deliberately carries NO ids at all — no user, branch or venue
// identifiers and nothing about authorization. Only what a swimmer needs to pick a
// session. Capacity is shown as a stored maximum, never as "spaces left", because
// no bookings exist yet.
export function projectMemberClass(cls, ctx) {
  const locationId = cls.location_id || null;
  const coachId = cls.coach_id || null;
  return {
    date: cls.class_date || null,
    start_time: cls.start_time || null,
    end_time: cls.end_time || null,
    level: cls.skill_level || null,
    level_label: LEVEL_LABELS[cls.skill_level] || null,
    name: cls.name || null,
    location_name: locationId ? ctx.locationNames[locationId] || null : null,
    branch_name: cls.branch_id ? ctx.branchNames[cls.branch_id] || null : null,
    coach_name: coachId ? ctx.coachNames[coachId] || null : null,
    capacity: typeof cls.max_capacity === 'number' ? cls.max_capacity : null,
    status: cls.status || 'scheduled'
  };
}

// ---------------------------------------------------------------- audit

// AuditLog is append-only and written with the service role only. Normal Admins
// can never edit it (RLS blocks update/delete for everyone).
export async function writeClassAudit(base44, actor, entry) {
  try {
    await base44.asServiceRole.entities.AuditLog.create({
      action: entry.action,
      actor_user_id: actor.id,
      actor_email: actor.email || null,
      target_type: entry.target_type || 'class',
      target_id: entry.target_id || null,
      branch_id: entry.branch_id || null,
      summary: entry.summary || null,
      details: entry.details ? JSON.stringify(entry.details).slice(0, 2000) : null
    });
  } catch (error) {
    // Never fail a completed write because the audit trail hiccuped, but make the
    // gap visible in the function logs.
    console.error('[audit] failed', entry && entry.action, error && (error.message || error));
  }
}

// ---------------------------------------------------------------- fetch helpers

// Only a genuine "record does not exist" becomes null. A rate limit or outage
// still rejects so the caller answers with the generic failure, never a 404.
export async function getRecordOrNull(base44, entityName, id) {
  try {
    return await base44.asServiceRole.entities[entityName].get(id);
  } catch (error) {
    const status = error && (error.status || error.statusCode || (error.response && error.response.status));
    const code = error && typeof error.code === 'string' ? error.code.toLowerCase() : '';
    if (status === 404 || code === 'not_found' || code === 'notfound') return null;
    throw error;
  }
}

// The branch a class belongs to. New records carry the server-derived snapshot;
// legacy records are resolved through their venue.
export async function resolveClassBranchId(base44, cls, cache) {
  if (cls.branch_id) return cls.branch_id;
  if (!cls.location_id) return null;
  const key = cls.location_id;
  if (cache && cache[key] !== undefined) return cache[key];
  const venue = await getRecordOrNull(base44, 'Location', cls.location_id);
  const resolved = venue ? venue.branch_id || null : null;
  if (cache) cache[key] = resolved;
  return resolved;
}