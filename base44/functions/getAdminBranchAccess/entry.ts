import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  authenticateCaller,
  readObjectBody,
  rejectUnknownParams,
  jsonError,
  serverFailure
} from '../../shared/directoryAccess.ts';
import {
  findUserById,
  getActiveAcademyAdminAssignment,
  isPlatformAdmin,
  publicUser,
  requireString
} from '../../shared/academyRoles.ts';
import { readAllPages, READ_PAGE_SIZE } from '../../shared/pagination.ts';

// READ-ONLY companion to assignAdminBranches, for the system-owner screen that sets
// an Admin's branch scope. It answers one question: "what branches may this Admin
// reach right now, and which branches could be chosen?"
//
// SYSTEM-OWNER ONLY (built-in platform User.role === 'admin'), the same gate as the
// write path. An academy Admin calling this is refused: scope is not self-service,
// so an Admin can never read or widen their own scope through this endpoint.
//
// Order of operations (nothing privileged happens before every gate passes):
//   1. authenticate the caller from the verified session
//   2. require the built-in platform-admin (system owner) role
//   3. validate the payload — only target_user_id is accepted
//   4. confirm the target user exists and holds an ACTIVE academy Admin role
//   5. read the ACTIVE branch options and the target's ACTIVE scope rows, walking
//      every cursor page so neither list can be silently truncated
//   6. return a minimal projection
//
// This function never writes: no assignment, no role, no audit entry, no email.
// Branch rows are projected to {id, name, code} only — internal notes and addresses
// never leave the server, and no User list is ever read.

const ALLOWED_PARAMS = ['target_user_id'];

// Minimum shape the screen needs to map a scope id back to a name.
function projectBranch(b) {
  return { id: b.id, name: b.name || null, code: b.code || null };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    // 1. Trusted identity.
    const auth = await authenticateCaller(base44);
    if (auth.error) return auth.error;

    // 2. System owner only (built-in platform admin), identical to the write path.
    if (!isPlatformAdmin(auth.user)) {
      return jsonError(403, 'System-owner authority required');
    }

    // 3. Payload validation.
    const bodyRes = await readObjectBody(req);
    if (bodyRes.error) return bodyRes.error;
    const body = bodyRes.body;

    const unknown = rejectUnknownParams(body, ALLOWED_PARAMS);
    if (unknown.error) return unknown.error;

    const tid = requireString(body.target_user_id, 'target_user_id');
    if (tid.error) return tid.error;

    // 4. The target must be an existing user who currently holds the Admin role.
    // Only a genuine not-found becomes a 404; every other SDK failure propagates to
    // the outer handler so "we could not check" never reads as "no such person".
    const target = await findUserById(base44, tid.value);
    if (target.error) return target.error;

    const targetAdmin = await getActiveAcademyAdminAssignment(base44, target.user.id);
    if (!targetAdmin) {
      return jsonError(400, 'Target member does not hold an active Admin role');
    }

    // 5. Complete reads. readAllPages fails closed: a malformed page or a cursor that
    // does not advance throws instead of returning a short, wrong list.
    const branchRows = await readAllPages(
      ({ cursor }) =>
        base44.asServiceRole.entities.Branch.filter(
          { is_active: true },
          { limit: READ_PAGE_SIZE, cursor }
        ),
      { label: 'active branches' }
    );

    const scopeRows = await readAllPages(
      ({ cursor }) =>
        base44.asServiceRole.entities.AdminBranchAssignment.filter(
          { user_id: target.user.id, is_active: true },
          { limit: READ_PAGE_SIZE, cursor }
        ),
      { label: 'admin branch scope' }
    );

    const branches = branchRows
      .filter((b) => b && b.id)
      .map(projectBranch)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

    // An all-branches row covers every active branch, now and in future, so a
    // specific id list is meaningless next to it.
    const allBranches = scopeRows.some((r) => r && r.all_branches === true);
    const branchIds = allBranches
      ? []
      : [...new Set(scopeRows.map((r) => r.branch_id).filter(Boolean))].sort();

    // 6. Minimal projection: the target's public identity, the choices, and the
    // scope as it stands. No account ids, notes, or unrelated profile data.
    return Response.json(
      {
        target_user: publicUser(target.user),
        branches,
        scope: {
          all_branches: allBranches,
          branch_ids: branchIds
        }
      },
      { status: 200 }
    );
  } catch (error) {
    // Diagnostics stay server-side; the client never sees SDK or database details.
    console.error(
      '[getAdminBranchAccess] unexpected failure',
      error && (error.stack || error.message || error)
    );
    return serverFailure('getAdminBranchAccess');
  }
}