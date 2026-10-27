// Central, server-only resolver for Swimflow Admin branch scope.
//
// This is the SINGLE place that decides which branches an Admin may see, so the
// rule cannot drift between privileged functions. It never reads a branch id
// supplied by the browser: scope comes from the caller's verified user id and
// the AdminBranchAssignment rows written by assignAdminBranches.
//
// Result shape (always one of these):
//   all-branches Admin -> { allBranches: true,  branchIds: [...], branches: [...active] }
//   specific branches  -> { allBranches: false, branchIds: [...], branches: [...in scope] }
//   no active scope    -> { allBranches: false, branchIds: [],    branches: [] } <- fails closed
//
// `branches` carries the Branch records the resolver has ALREADY read, so a caller
// never repeats an identical active-Branch query just to look up a branch name.
// It is the authorized subset only: never a branch outside scope.
//
// allBranches stays a FLAG instead of being flattened into a stored list:
// branchIds is recomputed from the currently active Branches on every call, so a
// branch created later is automatically covered without editing any assignment.

import { asArray } from './studentProfile.ts';

export const EMPTY_SCOPE = { allBranches: false, branchIds: [], branches: [] };

export async function listActiveBranches(base44) {
  const page = await base44.asServiceRole.entities.Branch.filter({ is_active: true }, { limit: 200 });
  return asArray(page).filter((b) => b && b.id);
}

export async function resolveAdminBranchScope(base44, userId) {
  if (!userId) return { ...EMPTY_SCOPE };

  const page = await base44.asServiceRole.entities.AdminBranchAssignment.filter(
    { user_id: userId, is_active: true },
    { limit: 200 }
  );
  const rows = asArray(page);
  // Read once. Callers receive these records in `branches`, so a directory request
  // does not run a second, identical active-Branch query afterwards.
  const activeBranches = await listActiveBranches(base44);
  const activeIds = activeBranches.map((b) => b.id);

  // One active all-branches row covers every active branch, now and in future.
  if (rows.some((r) => r.all_branches === true)) {
    return { allBranches: true, branchIds: [...activeIds].sort(), branches: activeBranches };
  }

  const requested = [
    ...new Set(rows.filter((r) => r.all_branches !== true).map((r) => r.branch_id).filter(Boolean))
  ];
  // A deactivated branch drops out of scope automatically, and duplicates cannot
  // widen anything — both are handled here rather than at each call site.
  const branchIds = requested.filter((id) => activeIds.includes(id)).sort();
  return {
    allBranches: false,
    branchIds,
    branches: activeBranches.filter((b) => branchIds.includes(b.id))
  };
}

export function isScopeEmpty(scope) {
  if (!scope) return true;
  if (scope.allBranches === true) return false;
  return !scope.branchIds || scope.branchIds.length === 0;
}

// A branch-scoped Admin sees a student only when the student's HOME branch is in
// scope. A student with no home branch is deliberately NOT granted to a
// branch-scoped Admin: a missing assignment is an administrative correction, not
// a reason to hand out access. The all-branches owner does see such records so
// they can be corrected.
export function isStudentInScope(scope, student) {
  if (!scope) return false;
  if (scope.allBranches === true) return true;
  const branchId = student && student.home_branch_id;
  if (!branchId) return false;
  return (scope.branchIds || []).includes(branchId);
}

// The branches an Admin may filter by — always a subset of their own scope.
export function branchesInScope(scope, activeBranches) {
  const list = activeBranches || [];
  if (!scope) return [];
  if (scope.allBranches === true) return list;
  return list.filter((b) => (scope.branchIds || []).includes(b.id));
}