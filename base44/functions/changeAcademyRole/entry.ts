import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { serverFailure } from '../../shared/directoryAccess.ts';
import {
  ASSIGNABLE_ROLES,
  canAppAdminChange,
  findRoleByName,
  findUserById,
  getActiveAcademyAdminAssignment,
  getActiveAssignment,
  isPlatformAdmin,
  requireString
} from '../../shared/academyRoles.ts';

// Change a user's academy role via a controlled, NON-atomic transition:
//   1. validate the target role (student|parent|coach)
//   2. deactivate the old assignment (soft — history preserved, never deleted)
//   3. assign the new role
// Gate: caller must hold an active academy-admin UserRole.
// Student / Parent / Coach only. Academy Admin is NOT changeable here — use
// promoteToAcademyAdmin to promote and revokeAcademyRole to remove an admin.
//
// NOT ATOMIC: if step 3 fails after step 2 succeeded, the response reports the
// actual state (old role now inactive, new role NOT assigned) with a recovery
// instruction. The admin can re-assign the old role to restore the prior state.
// We never pretend the transition was atomic.

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
    const fromRn = requireString(input.from_role_name, 'from_role_name');
    if (fromRn.error) return fromRn.error;
    const toRn = requireString(input.to_role_name, 'to_role_name');
    if (toRn.error) return toRn.error;

    if (!ASSIGNABLE_ROLES.includes(fromRn.value) || !ASSIGNABLE_ROLES.includes(toRn.value)) {
      return Response.json({ error: "roles must be 'student', 'parent', or 'coach'" }, { status: 400 });
    }
    if (fromRn.value === toRn.value) {
      return Response.json({ error: 'The user already has this role' }, { status: 400 });
    }

    // Caller authority (server-side, never trust a client claim):
    //  - academy admins may change between any assignable roles;
    //  - ordinary app admins may only make the everyday transitions
    //    (student <-> parent, student -> coach). Granting Coach from a Parent is
    //    reserved for academy admins.
    const callerAdmin = await getActiveAcademyAdminAssignment(base44, user.id);
    if (!callerAdmin && !isPlatformAdmin(user)) {
      return Response.json({ error: 'Administrator authority required' }, { status: 403 });
    }
    if (!callerAdmin && !canAppAdminChange(fromRn.value, toRn.value)) {
      return Response.json(
        { error: 'Only an Academy Admin can make this role change' },
        { status: 403 }
      );
    }

    // Validate target user.
    const { user: target, error: notFound } = await findUserById(base44, tid.value);
    if (notFound) return notFound;

    // Resolve both role records.
    const fromRoleRes = await findRoleByName(base44, fromRn.value);
    if (fromRoleRes.error) return fromRoleRes.error;
    const toRoleRes = await findRoleByName(base44, toRn.value);
    if (toRoleRes.error) return toRoleRes.error;

    // If the target already holds the new role active, nothing to change.
    const existingTo = await getActiveAssignment(base44, target.id, toRoleRes.role.id);
    if (existingTo) {
      return Response.json({ error: `This user already has an active '${toRn.value}' role` }, { status: 409 });
    }

    // Find the active old assignment to deactivate.
    const oldAssignment = await getActiveAssignment(base44, target.id, fromRoleRes.role.id);
    if (!oldAssignment) {
      return Response.json({ error: `No active '${fromRn.value}' role assignment found to change` }, { status: 404 });
    }

    // Step 1: deactivate the old assignment (soft; history preserved).
    const deactivated = await base44.asServiceRole.entities.UserRole.update(oldAssignment.id, {
      is_active: false
    });

    // Step 2: assign the new role. On failure, report the partial state.
    try {
      const created = await base44.asServiceRole.entities.UserRole.create({
        user_id: target.id,
        role_id: toRoleRes.role.id,
        assigned_by: user.id,
        assigned_date: new Date().toISOString(),
        is_active: true
      });
      return Response.json({
        from_assignment: { id: deactivated.id, role_name: fromRn.value, is_active: false },
        to_assignment: { id: created.id, role_name: toRn.value, is_active: true, assigned_date: created.assigned_date }
      }, { status: 201 });
    } catch (assignError) {
      // Partial failure: old role revoked, new role NOT assigned. Not atomic.
      return Response.json({
        error: `Role change failed partway: the '${fromRn.value}' role was revoked, but the '${toRn.value}' role could not be assigned. ${(assignError && assignError.message) || ''}`.trim(),
        partial: true,
        from_assignment: { id: deactivated.id, role_name: fromRn.value, is_active: false },
        to_role_name: toRn.value,
        recovery: `Re-assign the '${fromRn.value}' role to restore the previous state.`
      }, { status: 500 });
    }
  } catch (error) {
    // Diagnostics stay server-side: the client never sees SDK or database details.
    console.error('[changeAcademyRole] unexpected failure', error && (error.stack || error.message || error));
    return serverFailure('changeAcademyRole');
  }
}