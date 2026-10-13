// Shared helpers for student-profile backend functions.
// Pure validation/util only — no SDK calls, so it stays easy to reason about.

export const GENDER_VALUES = ['male', 'female', 'other'];
export const SWIMMING_LEVEL_VALUES = ['beginner', 'intermediate', 'advanced'];
export const DEPENDENT_RELATIONSHIPS = ['child', 'dependant', 'ward', 'sibling'];

// Fields the server always controls. Never accepted from client input on any path.
// NOTE: 'relationship' is handled per-function (rejected for self/update, required for dependent).
export const SERVER_CONTROLLED_FIELDS = [
  'account_id',
  'ownership_type',
  'consent_status',
  'consent_date',
  'status',
  'date_joined',
  'date_left',
  'reason_for_leaving'
];

// Fields a profile owner is allowed to edit directly.
export const MUTABLE_PROFILE_FIELDS = [
  'full_name',
  'date_of_birth',
  'gender',
  'swimming_level',
  'skill_progression',
  'medical_notes',
  'emergency_contact_name',
  'emergency_contact_phone'
];

export function jsonError(status, message, extra) {
  const body = { error: message };
  if (extra) Object.assign(body, extra);
  return Response.json(body, { status });
}

export function isValidISODate(d) {
  if (typeof d !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
}

export function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

// Whole-year age from a YYYY-MM-DD date of birth (UTC-stable).
export function ageFromDOB(dobStr, now) {
  if (!isValidISODate(dobStr)) return null;
  const ref = now || new Date();
  const dob = new Date(dobStr + 'T00:00:00Z');
  let age = ref.getUTCFullYear() - dob.getUTCFullYear();
  const m = ref.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && ref.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age >= 0 ? age : null;
}

// Consent evaluation for a self-managed profile based on age.
// Never returns 'given'. Preserves a previously recorded 'given'/'refused'
// (flagging it for review) when the new DOB is still a minor.
// `prev` may be undefined for a brand-new profile.
export function consentForSelf(dobStr, prev) {
  const age = ageFromDOB(dobStr);
  if (age === null) return null;
  if (age >= 18) return { consent_status: 'not_required', needs_review: false };
  if (prev === 'given' || prev === 'refused') {
    return { consent_status: prev, needs_review: true };
  }
  if (prev === 'not_required') {
    // Was treated as an adult; new DOB makes them a minor.
    return { consent_status: 'pending', needs_review: true };
  }
  return { consent_status: 'pending', needs_review: false };
}

// If any of `fields` is present in `input`, return a 400 Response; else null.
export function rejectFields(input, fields) {
  for (const f of fields) {
    if (input[f] !== undefined) {
      return jsonError(400, `Field '${f}' cannot be set or changed through this operation`);
    }
  }
  return null;
}

// Validate the common profile fields. `requireName`/`requireDob` toggle
// whether full_name / date_of_birth are mandatory (create vs update).
// Returns { error: Response } or { values: {...} }.
export function validateProfileInput(input, opts) {
  const o = opts || {};
  const requireName = o.requireName !== false;
  const requireDob = o.requireDob !== false;
  const values = {};

  if (input.full_name !== undefined) {
    if (typeof input.full_name !== 'string' || !input.full_name.trim()) {
      return { error: jsonError(400, 'full_name must be a non-empty string') };
    }
    values.full_name = input.full_name.trim();
  } else if (requireName) {
    return { error: jsonError(400, 'full_name is required') };
  }

  if (input.date_of_birth !== undefined) {
    if (!isValidISODate(input.date_of_birth)) {
      return { error: jsonError(400, 'date_of_birth must be a valid YYYY-MM-DD date') };
    }
    values.date_of_birth = input.date_of_birth;
  } else if (requireDob) {
    return { error: jsonError(400, 'date_of_birth is required') };
  }

  if (input.gender !== undefined) {
    if (!GENDER_VALUES.includes(input.gender)) {
      return { error: jsonError(400, 'gender must be one of male, female, other') };
    }
    values.gender = input.gender;
  }

  if (input.swimming_level !== undefined) {
    if (!SWIMMING_LEVEL_VALUES.includes(input.swimming_level)) {
      return { error: jsonError(400, 'swimming_level must be one of beginner, intermediate, advanced') };
    }
    values.swimming_level = input.swimming_level;
  }

  for (const f of ['skill_progression', 'medical_notes', 'emergency_contact_name', 'emergency_contact_phone']) {
    if (input[f] !== undefined) {
      if (typeof input[f] !== 'string') {
        return { error: jsonError(400, f + ' must be a string') };
      }
      values[f] = input[f];
    }
  }

  return { values };
}

// Normalize a filter() result that may be a page object {items} or a bare array.
export function asArray(pageOrArray) {
  if (!pageOrArray) return [];
  if (Array.isArray(pageOrArray)) return pageOrArray;
  if (Array.isArray(pageOrArray.items)) return pageOrArray.items;
  return [];
}