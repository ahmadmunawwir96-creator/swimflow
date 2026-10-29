import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { serverFailure } from '../../shared/directoryAccess.ts';
import {
  findRoleByName,
  findUserById,
  listActiveAcademyAdmins,
  getActiveAcademyAdminAssignment,
  requireString,
  jsonError
} from '../../shared/academyRoles.ts';

// One-time bootstrap of the first academy administrator.
// Gate: the caller must be a PLATFORM admin (User.role === 'admin') — the trusted
// app owner/seed admin. The function refuses to run once any active academy-admin
// UserRole exists.
//
// CONCURRENCY LIMITATION: there is no DB unique constraint and no atomic
// multi-document transaction. The "no existing academy admin" check is a
// read-then-write window: two simultaneous bootstrap calls could both observe
// zero admins and each create one. This function does NOT claim strict
// one-time enforcement. Mitigation: bootstrap should be run ONCE by a single
// platform admin via a controlled manual procedure (one operator, one call).
// A subsequent call (even concurrent) will be rejected as long as the first has
// committed before the second reads; if two commit in the race window, both
// become academy admins and one should be manually revoked via revokeAcademyRole
// (revokeAcademyAdmin last-admin guard does not apply during bootstrap — see
// that function's note).

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

    // Platform-admin gate (NOT academy admin — that role does not exist yet).
    if (user.role !== 'admin') {
      return Response.json({ error: 'Only a platform administrator may bootstrap the academy admin' }, { status: 403 });
    }

    let input;
    try {
      input = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const tid = requireString(input && input.target_user_id, 'target_user_id');
    if (tid.error) return tid.error;

    // Resolve the target user.
    const { user: target, error: notFound } = await findUserById(base44, tid.value);
    if (notFound) return notFound;

    // Reject reuse: if any active academy admin already exists, refuse.
    const { assignments } = await listActiveAcademyAdmins(base44);
    if (assignments.length > 0) {
      return Response.json(
        { error: 'An academy administrator already exists. Bootstrap is no longer available; use assignAcademyRole instead.' },
        { status: 409 }
      );
    }

    // If the target already has an inactive academy-admin assignment, re-activate it
    // rather than creating a duplicate. (History preserved.)
    const roleRes = await findRoleByName(base44, 'admin');
    if (roleRes.error) return roleRes.error;

    const existingInactivePage = await base44.asServiceRole.entities.UserRole.filter(
      { user_id: target.id, role_id: roleRes.role.id, is_active: false },
      { limit: 1 }
    );
    const inactive = (existingInactivePage.items || existingInactivePage)[0]
      ? (existingInactivePage.items || existingInactivePage)[0]
      : null;

    let assignment;
    if (inactive) {
      assignment = await base44.asServiceRole.entities.UserRole.update(inactive.id, {
        is_active: true,
        assigned_by: user.id,
        assigned_date: new Date().toISOString()
      });
    } else {
      assignment = await base44.asServiceRole.entities.UserRole.create({
        user_id: target.id,
        role_id: roleRes.role.id,
        assigned_by: user.id,
        assigned_date: new Date().toISOString(),
        is_active: true
      });
    }

    return Response.json(
      { assignment: { id: assignment.id, user_id: assignment.user_id, role_id: assignment.role_id, assigned_by: assignment.assigned_by, assigned_date: assignment.assigned_date, is_active: true } },
      { status: 201 }
    );
  } catch (error) {
    // Diagnostics stay server-side: the client never sees SDK or database details.
    console.error('[bootstrapAcademyAdmin] unexpected failure', error && (error.stack || error.message || error));
    return serverFailure('bootstrapAcademyAdmin');
  }
}