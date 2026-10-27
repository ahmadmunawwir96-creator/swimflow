import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  findUserById,
  getActiveAcademyAdminAssignment,
  isPlatformAdmin,
  jsonError,
  requireString
} from '../../shared/academyRoles.ts';

// Set an Admin's branch scope (exactly one mode: one specific branch, or all branches).
//
// SYSTEM-OWNER ONLY. The gate is the platform role (User.role === 'admin'), which is
// infrastructure/recovery authority — deliberately NOT the academy Admin role. This
// is what keeps "ordinary Admin cannot grant or scope Admin" true on the server, not
// just in the UI.
//
// Invariant (enforced here, never by the client):
//   all_branches === true  -> branch_id must be empty
//   all_branches === false -> branch_id is required
//
// Previous active scope rows are deactivated (never deleted), and the change is
// appended to AuditLog.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

    if (!isPlatformAdmin(user)) {
      return Response.json({ error: 'System-owner authority required' }, { status: 403 });
    }

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

    const allBranches = input.all_branches === true;
    const branchId =
      typeof input.branch_id === 'string' && input.branch_id.trim() ? input.branch_id.trim() : null;

    if (allBranches && branchId) {
      return jsonError(400, 'Provide either all_branches or branch_id, not both');
    }
    if (!allBranches && !branchId) {
      return jsonError(400, 'branch_id is required unless all_branches is true');
    }

    const target = await findUserById(base44, tid.value);
    if (target.error) return target.error;

    const targetAdmin = await getActiveAcademyAdminAssignment(base44, target.user.id);
    if (!targetAdmin) {
      return jsonError(400, 'Target member does not hold an active Admin role');
    }

    let branch = null;
    if (branchId) {
      branch = await base44.asServiceRole.entities.Branch.get(branchId).catch((e) =>
        e.status === 404 ? null : Promise.reject(e)
      );
      if (!branch) return jsonError(404, 'Branch not found');
      if (branch.is_active === false) return jsonError(400, 'Branch is not active');
    }

    // Deactivate any scope currently in force for this Admin.
    const existing = await base44.asServiceRole.entities.AdminBranchAssignment.filter(
      { user_id: target.user.id, is_active: true },
      { limit: 100 }
    );
    const existingRows = Array.isArray(existing) ? existing : existing.items || [];
    let deactivated = 0;
    for (const row of existingRows) {
      await base44.asServiceRole.entities.AdminBranchAssignment.update(row.id, { is_active: false });
      deactivated += 1;
    }

    const assignment = await base44.asServiceRole.entities.AdminBranchAssignment.create({
      user_id: target.user.id,
      all_branches: allBranches,
      branch_id: allBranches ? null : branchId,
      is_active: true,
      assigned_by: user.id,
      assigned_date: new Date().toISOString()
    });

    await base44.asServiceRole.entities.AuditLog.create({
      action: 'admin_branch_scope_set',
      actor_user_id: user.id,
      actor_email: user.email || null,
      target_type: 'user',
      target_id: target.user.id,
      branch_id: allBranches ? null : branchId,
      summary: allBranches
        ? 'Admin scope set to all branches'
        : 'Admin scope set to branch ' + (branch ? branch.name : branchId),
      details: JSON.stringify({
        all_branches: allBranches,
        branch_id: allBranches ? null : branchId,
        deactivated_previous: deactivated
      })
    });

    return Response.json(
      {
        assignment: {
          id: assignment.id,
          user_id: assignment.user_id,
          all_branches: assignment.all_branches === true,
          branch_id: assignment.branch_id || null,
          is_active: assignment.is_active,
          assigned_date: assignment.assigned_date
        },
        deactivated_previous: deactivated
      },
      { status: 200 }
    );
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}