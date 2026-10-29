import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { serverFailure } from '../../shared/directoryAccess.ts';
import {
  ACADEMY_ADMIN_ROLE,
  findRoleByName,
  findUserById,
  getActiveAcademyAdminAssignment,
  getActiveAssignment,
  requireString
} from '../../shared/academyRoles.ts';

// Dedicated, protected workflow to promote a trusted user to ACADEMY ADMIN.
// Deliberately separate from assignAcademyRole (student/parent/coach only), so
// the elevated role can never be granted through the ordinary assignment path.
//
// Gates (all enforced server-side; the UI is never the boundary):
//  - Caller must hold an ACTIVE academy-admin UserRole. Coaches, students,
//    parents, and ordinary users are refused (403) — no self-promotion.
//  - Writes ONLY the academy UserRole table. It never touches the built-in
//    platform User.role ('admin' there is Base44's own app role, not this one).
//  - Duplicate guard: refuses if the target already has an active admin role.
//
// Promotion is ADDITIVE: the target's existing active roles (student/parent/
// coach) are left intact, so no previous role is silently lost. Role history is
// preserved. Removing an admin is revokeAcademyRole('admin') (last-admin
// guarded, self-revocation blocked) — not this function.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

    let input;
    try { input = await req.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const tid = requireString(input.target_user_id, 'target_user_id');
    if (tid.error) return tid.error;

    // Caller must be an academy admin (server-side, never trust a client claim).
    const callerAdmin = await getActiveAcademyAdminAssignment(base44, user.id);
    if (!callerAdmin) {
      return Response.json({ error: 'Academy administrator authority required' }, { status: 403 });
    }

    // Validate target user.
    const { user: target, error: notFound } = await findUserById(base44, tid.value);
    if (notFound) return notFound;

    // Resolve the academy-admin role record.
    const roleRes = await findRoleByName(base44, ACADEMY_ADMIN_ROLE);
    if (roleRes.error) return roleRes.error;

    // Duplicate-active guard (read-then-write; no DB unique constraint).
    const existing = await getActiveAssignment(base44, target.id, roleRes.role.id);
    if (existing) {
      return Response.json(
        { error: 'This user is already an active academy administrator' },
        { status: 409 }
      );
    }

    // Additive promotion: add an active admin assignment, keep other roles.
    const assignment = await base44.asServiceRole.entities.UserRole.create({
      user_id: target.id,
      role_id: roleRes.role.id,
      assigned_by: user.id,
      assigned_date: new Date().toISOString(),
      is_active: true
    });

    return Response.json(
      {
        assignment: {
          id: assignment.id,
          user_id: assignment.user_id,
          role_id: assignment.role_id,
          role_name: ACADEMY_ADMIN_ROLE,
          assigned_by: assignment.assigned_by,
          assigned_date: assignment.assigned_date,
          is_active: true
        }
      },
      { status: 201 }
    );
  } catch (error) {
    // Diagnostics stay server-side: the client never sees SDK or database details.
    console.error('[promoteToAcademyAdmin] unexpected failure', error && (error.stack || error.message || error));
    return serverFailure('promoteToAcademyAdmin');
  }
}