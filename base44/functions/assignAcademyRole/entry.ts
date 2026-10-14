import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  ASSIGNABLE_ROLES,
  findRoleByName,
  findUserById,
  getActiveAcademyAdminAssignment,
  getActiveAssignment,
  requireString,
  jsonError
} from '../../shared/academyRoles.ts';

// Assign an academy role ('student' | 'parent') to a target user.
// Gate: caller must hold an active academy-admin UserRole.
// Never writes User.role. Coach/Admin assignment is NOT supported here.

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

    // Only student/parent assignable through this function.
    if (!ASSIGNABLE_ROLES.includes(rn.value)) {
      return Response.json(
        { error: "role_name must be 'student' or 'parent'" },
        { status: 400 }
      );
    }

    // Verify caller's academy-admin authority (server-side, never trust client claim).
    const callerAdmin = await getActiveAcademyAdminAssignment(base44, user.id);
    if (!callerAdmin) {
      return Response.json({ error: 'Academy administrator authority required' }, { status: 403 });
    }

    // Validate target user.
    const { user: target, error: notFound } = await findUserById(base44, tid.value);
    if (notFound) return notFound;

    // Resolve role record.
    const roleRes = await findRoleByName(base44, rn.value);
    if (roleRes.error) return roleRes.error;

    // Duplicate-active guard (check-then-write; see concurrency note in report).
    const existing = await getActiveAssignment(base44, target.id, roleRes.role.id);
    if (existing) {
      return Response.json(
        { error: `This user already has an active '${rn.value}' role assignment` },
        { status: 409 }
      );
    }

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
          role_name: rn.value,
          assigned_by: assignment.assigned_by,
          assigned_date: assignment.assigned_date,
          is_active: true
        }
      },
      { status: 201 }
    );
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}