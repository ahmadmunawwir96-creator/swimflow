import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  findUserById,
  getActiveAcademyAdminAssignment,
  isPlatformAdmin,
  jsonError,
  requireString
} from '../../shared/academyRoles.ts';

// Set an Admin's COMPLETE branch scope in one call. SYSTEM-OWNER ONLY (platform
// User.role === 'admin'); a Swimflow Admin can never assign or widen scope.
//
// Request contract:
//   { target_user_id, all_branches: true }                        -> whole academy
//   { target_user_id, all_branches: false, branch_ids: [id, ...] } -> those branches
//   { target_user_id, branch_ids: [id, ...] }                      -> all_branches defaults to false
//
// Rules enforced here (never on the client):
//  - all_branches and a non-empty branch_ids together are refused.
//  - branch_ids must be a non-empty list of unique, existing, active branches.
//  - The target must hold an active Swimflow Admin role.
//  - The call sets the complete scope: rows still wanted are kept, superseded rows
//    are DEACTIVATED (never deleted) so scope history survives, and missing rows are
//    created. Deactivation happens before creation, so an interruption leaves the
//    Admin with less access rather than more (fail closed).
//  - One active row per specific branch; at most one active all-branches row.
//
// A resolver reading the active rows therefore always gets either
//   { allBranches: true,  branchIds: [] }
//   { allBranches: false, branchIds: ["...", "..."] }
//   { allBranches: false, branchIds: [] }   <- no assignment: fail closed.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

    if (!isPlatformAdmin(user)) {
      return jsonError(403, 'System-owner authority required');
    }

    let input;
    try {
      input = await req.json();
    } catch {
      return jsonError(400, 'Invalid JSON body');
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return jsonError(400, 'Invalid request body');
    }

    const tid = requireString(input.target_user_id, 'target_user_id');
    if (tid.error) return tid.error;

    if (input.all_branches !== undefined && typeof input.all_branches !== 'boolean') {
      return jsonError(400, 'all_branches must be a boolean');
    }
    const allBranches = input.all_branches === true;

    let desiredIds = [];
    if (allBranches) {
      if (Array.isArray(input.branch_ids) && input.branch_ids.length > 0) {
        return jsonError(400, 'Provide either all_branches or branch_ids, not both');
      }
    } else {
      if (!Array.isArray(input.branch_ids)) {
        return jsonError(400, 'branch_ids must be an array of branch ids');
      }
      if (input.branch_ids.length === 0) {
        return jsonError(400, 'branch_ids must contain at least one branch id');
      }
      const cleaned = [];
      for (const raw of input.branch_ids) {
        if (typeof raw !== 'string' || !raw.trim()) {
          return jsonError(400, 'branch_ids must contain non-empty branch id strings');
        }
        cleaned.push(raw.trim());
      }
      if (new Set(cleaned).size !== cleaned.length) {
        return jsonError(400, 'branch_ids contains duplicate ids');
      }
      desiredIds = cleaned;
    }

    const target = await findUserById(base44, tid.value);
    if (target.error) return target.error;

    const targetAdmin = await getActiveAcademyAdminAssignment(base44, target.user.id);
    if (!targetAdmin) {
      return jsonError(400, 'Target member does not hold an active Admin role');
    }

    // Validate every requested branch exists and is active.
    const branchMap = {};
    if (!allBranches) {
      const found = await base44.asServiceRole.entities.Branch.filter(
        { id: { $in: desiredIds } },
        { limit: desiredIds.length }
      );
      const foundRows = Array.isArray(found) ? found : found.items || [];
      for (const b of foundRows) branchMap[b.id] = b;

      const unknown = desiredIds.filter((id) => !branchMap[id]);
      if (unknown.length > 0) {
        return jsonError(404, 'Unknown branch id: ' + unknown.join(', '));
      }
      const inactive = desiredIds.filter((id) => branchMap[id].is_active === false);
      if (inactive.length > 0) {
        return jsonError(400, 'Branch is not active: ' + inactive.join(', '));
      }
    }

    // Current scope (for reconciliation and the audit trail).
    const existingPage = await base44.asServiceRole.entities.AdminBranchAssignment.filter(
      { user_id: target.user.id, is_active: true },
      { limit: 200 }
    );
    const existingRows = Array.isArray(existingPage) ? existingPage : existingPage.items || [];

    const beforeScope = {
      all_branches: existingRows.some((r) => r.all_branches === true),
      branch_ids: existingRows.filter((r) => r.all_branches !== true && r.branch_id).map((r) => r.branch_id)
    };

    const toDeactivate = [];
    const keepIds = new Set();
    let keepAllBranchesRow = false;

    for (const row of existingRows) {
      if (allBranches) {
        if (row.all_branches === true && !keepAllBranchesRow) {
          keepAllBranchesRow = true;
          continue;
        }
        toDeactivate.push(row.id);
        continue;
      }
      if (row.all_branches !== true && row.branch_id && desiredIds.includes(row.branch_id) && !keepIds.has(row.branch_id)) {
        keepIds.add(row.branch_id);
        continue;
      }
      toDeactivate.push(row.id);
    }

    // Fail-closed ordering: drop superseded scope before granting new scope.
    for (const id of toDeactivate) {
      await base44.asServiceRole.entities.AdminBranchAssignment.update(id, { is_active: false });
    }

    const assignedDate = new Date().toISOString();
    const createdIds = [];

    if (allBranches && !keepAllBranchesRow) {
      const row = await base44.asServiceRole.entities.AdminBranchAssignment.create({
        user_id: target.user.id,
        all_branches: true,
        branch_id: null,
        is_active: true,
        assigned_by: user.id,
        assigned_date: assignedDate
      });
      createdIds.push(row.id);
    }

    if (!allBranches) {
      for (const branchId of desiredIds) {
        if (keepIds.has(branchId)) continue;
        const row = await base44.asServiceRole.entities.AdminBranchAssignment.create({
          user_id: target.user.id,
          all_branches: false,
          branch_id: branchId,
          is_active: true,
          assigned_by: user.id,
          assigned_date: assignedDate
        });
        createdIds.push(row.id);
      }
    }

    const afterScope = {
      all_branches: allBranches,
      branch_ids: allBranches ? [] : desiredIds
    };
    const scopeLabel = allBranches
      ? 'all branches'
      : desiredIds.map((id) => (branchMap[id] ? branchMap[id].name : id)).join(', ');

    await base44.asServiceRole.entities.AuditLog.create({
      action: 'admin_branch_scope_set',
      actor_user_id: user.id,
      actor_email: user.email || null,
      target_type: 'user',
      target_id: target.user.id,
      branch_id: null,
      summary: 'Admin branch scope set to ' + scopeLabel,
      details: JSON.stringify({
        before: beforeScope,
        after: afterScope,
        deactivated_assignment_ids: toDeactivate,
        created_assignment_ids: createdIds
      })
    });

    return Response.json(
      {
        scope: afterScope,
        branch_names: allBranches ? [] : desiredIds.map((id) => (branchMap[id] ? branchMap[id].name : null)),
        deactivated_count: toDeactivate.length,
        created_count: createdIds.length
      },
      { status: 200 }
    );
  } catch (error) {
    // Diagnostics stay in the function logs; the client never sees internals.
    console.error('[assignAdminBranches] unexpected failure', error);
    return Response.json({ error: 'Scope change could not be completed' }, { status: 500 });
  }
}