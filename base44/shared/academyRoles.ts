// Shared helpers for academy role-assignment backend functions.
// Pure validation/lookup utilities used by assign/revoke/list/findUserByEmail/bootstrap.
// No state, no SDK side effects beyond the calls the caller passes in.

import { asArray } from './studentProfile.ts';
import { isNotFoundError } from './sdkErrors.ts';

// Re-export the page/array normalizer under the alias the list function imports.
export { asArray as asArrayFallback };

// Roles that assignAcademyRole / changeAcademyRole may grant. Student, Parent,
// and Coach. Academy-Admin ('admin') is deliberately excluded: promotion to
// Academy Admin is a separate, separately-gated workflow (promoteToAcademyAdmin),
// so it can never be granted by the ordinary role-assignment path.
export const ASSIGNABLE_ROLES = ['student', 'parent', 'coach'];

// Academy-admin role name. Distinct from the built-in platform User.role === 'admin'.
export const ACADEMY_ADMIN_ROLE = 'admin';

// The only role-to-role transitions an ordinary app admin may perform: an app
// admin is a platform User with role === 'admin' and NO academy-admin assignment.
// Granting Coach from a Parent and granting the app Admin role are reserved for
// academy admins.
export const APP_ADMIN_CHANGE_TARGETS = {
  student: ['parent', 'coach'],
  parent: ['student']
};

export function canAppAdminChange(fromRoleName, toRoleName) {
  return (APP_ADMIN_CHANGE_TARGETS[fromRoleName] || []).includes(toRoleName);
}

// True when the caller holds the built-in platform admin role.
export function isPlatformAdmin(user) {
  return !!user && user.role === 'admin';
}

export function jsonError(status, message, extra?) {
  const body = { error: message };
  if (extra) Object.assign(body, extra);
  return Response.json(body, { status });
}

// Resolve a Role record by name via service role. Returns { role } or { error }.
export async function findRoleByName(base44, name) {
  const page = await base44.asServiceRole.entities.Role.filter({ name }, { limit: 1 });
  const roles = asArray(page);
  if (roles.length === 0) return { error: jsonError(500, `Role '${name}' is not configured in the academy`) };
  return { role: roles[0] };
}

// Resolve a Role that MUST exist, or throw.
//
// A missing Role record is a CONFIGURATION failure, not "this user has no
// assignment". Collapsing the two would deny an authorised admin (403) or tell
// bootstrap that the academy has no admins at all — the failure would be invisible.
// Throwing hands it to the calling endpoint's existing generic-500 handler, so the
// client sees the shared failure message and the detail stays in the logs.
export async function requireRoleByName(base44, name) {
  const roleRes = await findRoleByName(base44, name);
  if (roleRes.error) {
    console.error('[academyRoles.requireRoleByName] required role is unavailable', name);
    throw new Error(`Required role '${name}' is not configured`);
  }
  return roleRes.role;
}

// Return the caller's active academy-admin UserRole record, or null.
// A healthy empty result (no assignment) stays null; an unavailable role config throws.
export async function getActiveAcademyAdminAssignment(base44, userId) {
  const role = await requireRoleByName(base44, ACADEMY_ADMIN_ROLE);
  const page = await base44.asServiceRole.entities.UserRole.filter(
    { user_id: userId, role_id: role.id, is_active: true },
    { limit: 1 }
  );
  return asArray(page)[0] || null;
}

// Return ALL active academy-admin UserRole assignments. Used for bootstrap reuse
// check and last-admin guard. An unavailable role config throws instead of
// reporting an empty admin set — bootstrap must never read that as "none exist".
export async function listActiveAcademyAdmins(base44) {
  const role = await requireRoleByName(base44, ACADEMY_ADMIN_ROLE);
  const page = await base44.asServiceRole.entities.UserRole.filter(
    { role_id: role.id, is_active: true },
    { limit: 100 }
  );
  return { assignments: asArray(page) };
}

// Resolve an active UserRole assignment for (user, role). Returns record or null.
export async function getActiveAssignment(base44, userId, roleId) {
  const page = await base44.asServiceRole.entities.UserRole.filter(
    { user_id: userId, role_id: roleId, is_active: true },
    { limit: 1 }
  );
  return asArray(page)[0] || null;
}

// Resolve an active assignment for (user, role NAME). Returns record or null.
// Generic helper for server-side gates on any academy role. A healthy empty result
// stays null; an unavailable role config throws (see requireRoleByName).
export async function getActiveRoleAssignment(base44, userId, roleName) {
  const role = await requireRoleByName(base44, roleName);
  return getActiveAssignment(base44, userId, role.id);
}

// Convenience gate for future coach-scoped functions (class assignment,
// attendance management). Coach grants NO academy-admin authority.
export async function getActiveCoachAssignment(base44, userId) {
  return getActiveRoleAssignment(base44, userId, 'coach');
}

// Resolve a target User by id via service role. Returns { user } or { error: 404 }.
// User.filter is not available; User.get(id) is.
//
// Only a GENUINE "no such user" is a 404: a missing/blank id, a null result, or an
// SDK error that reports 404 / not_found. Any other failure (rate limit, database
// outage, SDK error) is rethrown so the calling endpoint answers with its existing
// generic 500 — reported to staff as "that user does not exist" it would be a lie,
// and listings that enrich rows through resolveUserMap would silently drop real
// coaches and staff from the screen. Diagnostics and the generic message both stay
// with the callers' existing handlers, so no SDK detail ever reaches the client.
export async function findUserById(base44, userId) {
  const missing = { error: jsonError(404, 'Target user not found') };
  if (!userId) return missing;
  let user;
  try {
    user = await base44.asServiceRole.entities.User.get(userId);
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    return missing;
  }
  if (!user) return missing;
  return { user };
}

// Resolve a map of user_id -> User for a set of ids (deduped). A user that genuinely
// does not exist is omitted from the map. Any OTHER lookup failure rejects the whole
// call: a listing must fail loudly rather than silently omit coaches and staff who
// do exist. Used to enrich role-assignment and class listings with human names
// instead of bare IDs. Bounded to the assignment count (admin screen, small N).
export async function resolveUserMap(base44, userIds) {
  const unique: string[] = [...new Set((userIds || []).filter(Boolean))] as string[];
  const map: Record<string, any> = {};
  const results = await Promise.all(unique.map((id) => findUserById(base44, id)));
  results.forEach((r: any, idx: number) => {
    if (r.user) map[unique[idx]] = r.user;
  });
  return map;
}

// Resolve a target User by email via service role. Returns { user } or { error: 404 }.
// Narrow filter — never enumerates users.
export async function findUserByEmail(base44, email) {
  // User.filter with an options object is rejected by the SDK. The docs example
  // calls filter({ email }) with no options — try that first. Fallback to User.list
  // (no email filter) is intentionally NOT used because it would enumerate users.
  let users;
  try {
    const res = await base44.asServiceRole.entities.User.filter({ email });
    users = asArray(res);
  } catch (e) {
    // An unexpected SDK/database failure is NOT "no such user": the caller would
    // tell staff the person does not exist while the real problem is temporary.
    // Diagnostics stay server-side; the client gets the shared generic message.
    // jsonError is the local copy on purpose — directoryAccess.ts already imports
    // this module, so importing its serverFailure here would be circular.
    console.error('[academyRoles.findUserByEmail] user lookup failed', e && (e.stack || e.message || e));
    return { error: jsonError(500, 'This information could not be loaded right now. Please try again.') };
  }
  if (users.length === 0) return { error: jsonError(404, 'No user found with that email') };
  return { user: users[0] };
}

// Minimal public projection of a user for role-management UIs.
export function publicUser(user) {
  return { user_id: user.id, email: user.email, full_name: user.full_name || user.display_name || null };
}

// Minimal projection of a role assignment joined with its Role name and owner.
export function publicAssignment(assignment, role, user) {
  return {
    id: assignment.id,
    user_id: assignment.user_id,
    user_name: user ? (user.full_name || user.display_name) : null,
    user_email: user ? user.email : null,
    role_id: assignment.role_id,
    role_name: role ? role.name : null,
    assigned_by: assignment.assigned_by,
    assigned_date: assignment.assigned_date,
    is_active: assignment.is_active
  };
}

// Validate a string id input.
export function requireString(input, field) {
  const v = input && typeof input === 'string' && input.trim();
  if (!v) return { error: jsonError(400, field + ' is required') };
  return { value: v.trim() };
}

// Validate an email string (basic shape).
export function requireEmail(input) {
  if (typeof input !== 'string' || !input.trim()) return { error: jsonError(400, 'email is required') };
  const v = input.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return { error: jsonError(400, 'email is not valid') };
  return { value: v };
}