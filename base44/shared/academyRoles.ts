// Shared helpers for academy role-assignment backend functions.
// Pure validation/lookup utilities used by assign/revoke/list/findUserByEmail/bootstrap.
// No state, no SDK side effects beyond the calls the caller passes in.

import { asArray } from './studentProfile.ts';

// Re-export the page/array normalizer under the alias the list function imports.
export { asArray as asArrayFallback };

// Roles that assignAcademyRole may grant (academy admins promote members).
// 'admin' (academy admin) and 'coach' are included so admins can promote
// students/parents to coach or academy admin. The first academy admin still
// comes from bootstrapAcademyAdmin; subsequent admins can be assigned here.
export const ASSIGNABLE_ROLES = ['student', 'parent', 'coach', 'admin'];

// Academy-admin role name. Distinct from the built-in platform User.role === 'admin'.
export const ACADEMY_ADMIN_ROLE = 'admin';

export function jsonError(status, message, extra) {
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

// Return the caller's active academy-admin UserRole record, or null.
export async function getActiveAcademyAdminAssignment(base44, userId) {
  const roleRes = await findRoleByName(base44, ACADEMY_ADMIN_ROLE);
  if (roleRes.error) return null;
  const page = await base44.asServiceRole.entities.UserRole.filter(
    { user_id: userId, role_id: roleRes.role.id, is_active: true },
    { limit: 1 }
  );
  return asArray(page)[0] || null;
}

// Return ALL active academy-admin UserRole assignments. Used for bootstrap reuse
// check and last-admin guard.
export async function listActiveAcademyAdmins(base44) {
  const roleRes = await findRoleByName(base44, ACADEMY_ADMIN_ROLE);
  if (roleRes.error) return { assignments: [] };
  const page = await base44.asServiceRole.entities.UserRole.filter(
    { role_id: roleRes.role.id, is_active: true },
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

// Resolve a target User by id via service role. Returns { user } or { error: 404 }.
// User.filter is not available; User.get(id) is. A bad/missing id throws -> 404.
export async function findUserById(base44, userId) {
  try {
    const user = await base44.asServiceRole.entities.User.get(userId);
    if (!user) return { error: jsonError(404, 'Target user not found') };
    return { user };
  } catch {
    return { error: jsonError(404, 'Target user not found') };
  }
}

// Resolve a map of user_id -> User for a set of ids (deduped). Missing users are
// omitted from the map. Used to enrich role-assignment listings with human names
// instead of bare IDs. Bounded to the assignment count (admin screen, small N).
export async function resolveUserMap(base44, userIds) {
  const unique = [...new Set((userIds || []).filter(Boolean))];
  const map = {};
  const results = await Promise.all(unique.map((id) => findUserById(base44, id)));
  results.forEach((r, idx) => {
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
    return { error: jsonError(500, 'User lookup is unavailable: ' + (e && e.message ? e.message : 'unknown error')) };
  }
  if (users.length === 0) return { error: jsonError(404, 'No user found with that email') };
  return { user: users[0] };
}

// Minimal public projection of a user for role-management UIs.
export function publicUser(user) {
  return { user_id: user.id, email: user.email, full_name: user.full_name };
}

// Minimal projection of a role assignment joined with its Role name and owner.
export function publicAssignment(assignment, role, user) {
  return {
    id: assignment.id,
    user_id: assignment.user_id,
    user_name: user ? user.full_name : null,
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