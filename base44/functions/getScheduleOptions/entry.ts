import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  authenticateCaller,
  readObjectBody,
  rejectUnknownParams,
  jsonError,
  serverFailure
} from '../../shared/directoryAccess.ts';
import { resolveAdminBranchScope, isScopeEmpty } from '../../shared/adminScope.ts';
import {
  createRoleCache,
  authorizeAcademyAdminWithCache,
  loadAdminLocations,
  loadAdminCoaches,
  todayInAcademyZone,
  LEVELS,
  LEVEL_LABELS,
  MIN_CAPACITY,
  MAX_CAPACITY,
  CANCELLATION_TYPES,
  CANCELLATION_TYPE_LABELS
} from '../../shared/classAccess.ts';

// Everything the Admin schedule screens need to render their selectors: the
// branches in scope, the venues in those branches and the users holding an active
// Coach role. One call instead of three, and every value is already authorized.
//
// Supported input: {} (no parameters).
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    const auth = await authenticateCaller(base44);
    if (auth.error) return auth.error;

    const roles = createRoleCache(base44);
    const gate = await authorizeAcademyAdminWithCache(base44, auth.user, roles);
    if (gate.error) return gate.error;

    const bodyRes = await readObjectBody(req);
    if (bodyRes.error) return bodyRes.error;
    const unknown = rejectUnknownParams(bodyRes.body, []);
    if (unknown.error) return unknown.error;

    const scope = await resolveAdminBranchScope(base44, auth.user.id);
    if (isScopeEmpty(scope)) {
      return jsonError(403, 'No branch is assigned to your admin account');
    }

    const [locations, coaches] = await Promise.all([
      loadAdminLocations(base44, scope),
      loadAdminCoaches(base44, roles)
    ]);

    return Response.json(
      {
        today: todayInAcademyZone(),
        branches: (scope.branches || []).map((branch) => ({
          id: branch.id,
          name: branch.name,
          code: branch.code || null
        })),
        locations,
        coaches,
        levels: LEVELS.map((value) => ({ value, label: LEVEL_LABELS[value] })),
        capacity: { min: MIN_CAPACITY, max: MAX_CAPACITY },
        cancellation_types: CANCELLATION_TYPES.map((value) => ({
          value,
          label: CANCELLATION_TYPE_LABELS[value]
        })),
        scope: { all_branches: scope.allBranches, branch_ids: scope.branchIds }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[getScheduleOptions] unexpected failure', error && (error.stack || error.message || error));
    return serverFailure('getScheduleOptions');
  }
}