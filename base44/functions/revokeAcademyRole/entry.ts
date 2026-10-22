import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  ASSIGNABLE_ROLES,
  ACADEMY_ADMIN_ROLE,
  findRoleByName,
  findUserById,
  getActiveAcademyAdminAssignment,
  getActiveAssignment,
  listActiveAcademyAdmins,
  requireString
} from '../../shared/academyRoles.ts';

// Deactivate an academy role assignment (soft-delete; history preserved).
// Gate: caller must hold an active academy-admin UserRole.
// Guards:
//  - Cannot revoke your own academy-admin role (self-protection).
//  - Cannot revoke the last active academy-admin role (lockout prevention).
//  - Student, Parent, Coach, and Academy-Admin roles may all be revoked.
//  - 'admin' role revocation is allowed (to step down a promoted admin, or to
//    remove an extra admin from a concurrent bootstrap race) ONLY when more
//    than one active admin remains.
//
// CONCURRENCY LIMITATION: the last-admin guard is read-then-write; two near-
// simultaneous revokes could each see 2 admins and both proceed, leaving 0.
// This is documented, not guaranteed. Mitigation: revoke admin roles one at a
// time, deliberately.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

    let input;
    try {
      input = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const tid = requireString(input.target_user_id, 'target_user_id');
    if (tid.error) return tid.error;
    const rn = requireString(input.role_name, 'role_name');
    if (rn.error) return rn.error;

    // Allowable role names: student, parent, coach, and admin.
    // ASSIGNABLE_ROLES now includes 'coach'; ACADEMY_ADMIN_ROLE is added so a
    // promoted/duplicate academy admin can be removed (last-admin guard applies).
    const allowed = [...ASSIGNABLE_ROLES, ACADEMY_ADMIN_ROLE];
    if (!allowed.includes(rn.value)) {
      return Response.json({ error: "role_name must be 'student', 'parent', 'coach', or 'admin'" }, { status: 400 });
    }

    // Caller must be an academy admin.
    const callerAdmin = await getActiveAcademyAdminAssignment(base44, user.id);
    if (!callerAdmin) {
      return Response.json({ error: 'Academy administrator authority required' }, { status: 403 });
    }

    // Validate target user.
    const { user: target, error: notFound } = await findUserById(base44, tid.value);
    if (notFound) return notFound;

    // Resolve role.
    const roleRes = await findRoleByName(base44, rn.value);
    if (roleRes.error) return roleRes.error;

    // Find the active assignment to revoke.
    const assignment = await getActiveAssignment(base44, target.id, roleRes.role.id);
    if (!assignment) {
      return Response.json({ error: `No active '${rn.value}' role assignment found for this user` }, { status: 404 });
    }

    // Self-revocation of academy admin is blocked.
    if (rn.value === ACADEMY_ADMIN_ROLE && target.id === user.id) {
      return Response.json({ error: 'You cannot revoke your own academy administrator role' }, { status: 400 });
    }

    // Last-active-admin lockout guard.
    if (rn.value === ACADEMY_ADMIN_ROLE) {
      const { assignments } = await listActiveAcademyAdmins(base44);
      if (assignments.length <= 1) {
        return Response.json(
          { error: 'Cannot revoke the last active academy administrator. Assign another admin first.' },
          { status: 400 }
        );
      }
    }

    // Deactivate (preserve history, never delete).
    const updated = await base44.asServiceRole.entities.UserRole.update(assignment.id, {
      is_active: false
    });

    return Response.json(
      { assignment: { id: updated.id, user_id: updated.user_id, role_id: updated.role_id, role_name: rn.value, is_active: false } },
      { status: 200 }
    );
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}