// Reusable server-side authorization + input-validation pattern for privileged
// Academy Admin reads.
//
// Order of operations enforced by every function that uses this module:
//   1. authenticateCaller   — trusted server-side identity (never a client id)
//   2. authorizeAcademyAdmin — active academy-admin assignment, resolved with
//                              the service role, independent of anything the
//                              browser sent
//   3. input validation     — reject unknown/unsupported parameters
//   4. elevated read        — asServiceRole is only reached after 1-3 pass
//   5. least-privilege projection — only the fields the screen needs
//
// Academy Admin is a business role stored in Role/UserRole. It is deliberately
// NOT the built-in platform User.role === 'admin': nothing here treats a
// platform admin as an academy admin.

import { getActiveAcademyAdminAssignment } from './academyRoles.ts';
import { asArray } from './studentProfile.ts';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
export const MAX_SEARCH_LENGTH = 80;

// Only these keys may be supplied by the browser. Anything else is rejected so a
// caller cannot smuggle in a branch id, role, or account id hoping it is honoured.
export const DIRECTORY_ALLOWED_PARAMS = ['search', 'status', 'limit', 'cursor', 'branch_id'];

// Mirrors the Student.status enum. 'all' and empty both mean "no status filter".
export const STUDENT_STATUS_VALUES = ['active', 'inactive', 'trial', 'left'];

export function jsonError(status, message, extra) {
  const body = { error: message };
  if (extra) Object.assign(body, extra);
  return Response.json(body, { status });
}

// 500 responses never echo internal messages (stack traces, SDK errors, field
// names). Details are logged server-side only.
export function serverFailure(scope) {
  console.error(scope + ' failed');
  return jsonError(500, 'This information could not be loaded right now. Please try again.');
}

// True ONLY when the SDK reported that the record does not exist.
//
// This is deliberately strict. Treating every thrown error as "not found" turns a
// rate limit, a database outage or an SDK failure into "this student does not
// exist" — the screen then tells staff the swimmer is gone when the real problem
// is temporary. Any error that is not a genuine 404 must reach the generic server
// failure handler instead.
export function isNotFoundError(e) {
  if (!e) return false;
  const status = e.status || e.statusCode || (e.response && e.response.status);
  if (status === 404) return true;
  const code = typeof e.code === 'string' ? e.code.toLowerCase() : '';
  return code === 'not_found' || code === 'notfound';
}

// 1. Trusted identity. The caller id comes from the verified session, never a body field.
export async function authenticateCaller(base44) {
  let user;
  try {
    user = await base44.auth.me();
  } catch {
    return { error: jsonError(401, 'Authentication required') };
  }
  if (!user || !user.id) return { error: jsonError(401, 'Authentication required') };
  return { user };
}

// 2. Academy-admin gate. Returns the caller's active assignment, or a 403.
export async function authorizeAcademyAdmin(base44, user) {
  const assignment = await getActiveAcademyAdminAssignment(base44, user.id);
  if (!assignment) return { error: jsonError(403, 'Admins only') };
  return { assignment };
}

export async function readObjectBody(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return { error: jsonError(400, 'Invalid JSON body') };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: jsonError(400, 'Invalid request body') };
  }
  return { body };
}

// 3a. Reject unsupported keys, and say what is supported.
export function rejectUnknownParams(body, allowed) {
  const extra = Object.keys(body).filter((k) => !allowed.includes(k));
  if (extra.length) {
    return { error: jsonError(400, 'Unsupported parameter(s): ' + extra.join(', ')) };
  }
  return {};
}

// Escape regex metacharacters so a search term is matched literally. Without
// this a term like "(" makes the query invalid and a crafted term changes the
// meaning of the query.
export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 3b. Field validators. Each returns { value } or { error }.
export function parseLimit(value) {
  if (value === undefined || value === null || value === '') return { value: DEFAULT_PAGE_SIZE };
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    return { error: jsonError(400, 'limit must be a positive integer') };
  }
  return { value: Math.min(n, MAX_PAGE_SIZE) };
}

export function parseSearch(value) {
  if (value === undefined || value === null) return { value: '' };
  if (typeof value !== 'string') return { error: jsonError(400, 'search must be a string') };
  const v = value.trim();
  if (v.length > MAX_SEARCH_LENGTH) {
    return { error: jsonError(400, `search must be ${MAX_SEARCH_LENGTH} characters or fewer`) };
  }
  return { value: v };
}

export function parseStatus(value) {
  if (value === undefined || value === null || value === '' || value === 'all') return { value: null };
  if (typeof value !== 'string' || !STUDENT_STATUS_VALUES.includes(value)) {
    return { error: jsonError(400, 'status must be one of ' + STUDENT_STATUS_VALUES.join(', ')) };
  }
  return { value };
}

// A branch filter is a convenience only. It is validated as a string here and
// then checked against the server-resolved scope by the caller — a branch id the
// Admin is not scoped to is refused, never merged into the query.
export function parseBranchId(value) {
  if (value === undefined || value === null || value === '') return { value: null };
  if (typeof value !== 'string' || !value.trim()) {
    return { error: jsonError(400, 'branch_id must be a non-empty string') };
  }
  return { value: value.trim() };
}

export function parseCursor(value) {
  if (value === undefined || value === null || value === '') return { value: null };
  if (typeof value !== 'string') return { error: jsonError(400, 'cursor must be a string') };
  return { value };
}

// Read one page from a filter() result that may be a page object or a bare array.
export function toPage(result) {
  if (Array.isArray(result)) return { items: result, next_cursor: null, has_more: false };
  return {
    items: asArray(result),
    next_cursor: (result && result.next_cursor) || null,
    has_more: !!(result && result.has_more)
  };
}

// 5. Least-privilege projection for the directory screen.
// Deliberately excluded: medical_notes, emergency contacts, reason_for_leaving,
// consent guardian contact details, account_id, and all payment/token data.
export function projectDirectoryStudent(s, branchName) {
  return {
    id: s.id,
    full_name: s.full_name || null,
    date_of_birth: s.date_of_birth || null,
    gender: s.gender || null,
    swimming_level: s.swimming_level || null,
    status: s.status || 'active',
    ownership_type: s.ownership_type || null,
    relationship: s.relationship || null,
    consent_status: s.consent_status || null,
    date_joined: s.date_joined || null,
    // The student's HOME branch (management branch) — not the branch of the
    // classes they swim in. null means the record still needs assigning.
    home_branch_id: s.home_branch_id || null,
    home_branch_name: branchName || null
  };
}

// Admin-facing single-student projection: the directory fields plus the safety and
// consent context an administrator legitimately needs. Still excludes account_id,
// tokens, payments and any unrelated internal identifiers.
export function projectStudentDetail(s, branchName) {
  return {
    ...projectDirectoryStudent(s, branchName),
    skill_progression: s.skill_progression || null,
    medical_notes: s.medical_notes || null,
    emergency_contact_name: s.emergency_contact_name || null,
    emergency_contact_phone: s.emergency_contact_phone || null,
    consent_guardian_name: s.consent_guardian_name || null,
    consent_guardian_phone: s.consent_guardian_phone || null,
    consent_date: s.consent_date || null,
    date_left: s.date_left || null,
    reason_for_leaving: s.reason_for_leaving || null
  };
}