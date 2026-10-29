import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  authenticateCaller,
  readObjectBody,
  rejectUnknownParams,
  jsonError,
  serverFailure
} from '../../shared/directoryAccess.ts';
import { resolveAdminBranchScope, isScopeEmpty } from '../../shared/adminScope.ts';
import { asArray } from '../../shared/studentProfile.ts';
import {
  createRoleCache,
  authorizeAcademyAdminWithCache,
  loadAdminLocations,
  loadAdminCoaches,
  buildClassContext,
  todayInAcademyZone,
  DAY_OF_WEEK_LABELS,
  LEVELS,
  LEVEL_LABELS,
  MIN_CAPACITY,
  MAX_CAPACITY
} from '../../shared/classAccess.ts';
import { projectClassGroup } from '../../shared/classGroups.ts';

// Class groups the caller may manage, plus everything the group form needs to
// render its selectors. One call, and every value is already authorized: a group
// is only included when its branch is inside the caller's scope.
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

    const [locations, coaches, page] = await Promise.all([
      loadAdminLocations(base44, scope),
      loadAdminCoaches(base44, roles),
      base44.asServiceRole.entities.ClassGroup.filter(
        { branch_id: { $in: scope.branchIds } },
        { limit: 200, sort: '-created_date' }
      )
    ]);

    const locationNames = {};
    locations.forEach((venue) => {
      locationNames[venue.id] = venue.name;
    });
    const branchNames = {};
    (scope.branches || []).forEach((branch) => {
      branchNames[branch.id] = branch.name;
    });
    const coachNames = {};
    const activeCoachIds = new Set();
    coaches.forEach((coach) => {
      coachNames[coach.user_id] = coach.name;
      activeCoachIds.add(coach.user_id);
    });

    const ctx = buildClassContext({ locationNames, branchNames, coachNames, activeCoachIds });

    const groups = asArray(page)
      .filter((group) => group && group.branch_id && scope.branchIds.includes(group.branch_id))
      .map((group) => projectClassGroup(group, ctx))
      .sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        const dayDiff = (a.day_of_week ?? 9) - (b.day_of_week ?? 9);
        if (dayDiff !== 0) return dayDiff;
        return String(a.start_time || '').localeCompare(String(b.start_time || ''));
      });

    return Response.json(
      {
        today: todayInAcademyZone(),
        class_groups: groups,
        branches: (scope.branches || []).map((branch) => ({
          id: branch.id,
          name: branch.name,
          code: branch.code || null
        })),
        locations,
        coaches,
        has_coaches: coaches.length > 0,
        days: DAY_OF_WEEK_LABELS.map((label, value) => ({ value, label })),
        levels: LEVELS.map((value) => ({ value, label: LEVEL_LABELS[value] })),
        capacity: { min: MIN_CAPACITY, max: MAX_CAPACITY },
        scope: { all_branches: scope.allBranches, branch_ids: scope.branchIds }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[listClassGroups] unexpected failure', error && (error.stack || error.message || error));
    return serverFailure('listClassGroups');
  }
}