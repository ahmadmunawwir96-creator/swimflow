import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  authenticateCaller,
  readObjectBody,
  rejectUnknownParams,
  jsonError,
  serverFailure
} from '../../shared/directoryAccess.ts';
import { resolveAdminBranchScope, isScopeEmpty } from '../../shared/adminScope.ts';
import { resolveUserMap } from '../../shared/academyRoles.ts';
import {
  createRoleCache,
  authorizeAcademyAdminWithCache,
  loadAdminLocations,
  loadAdminCoaches,
  projectAdminClass,
  buildClassContext,
  displayName,
  todayInAcademyZone,
  DAY_OF_WEEK_LABELS,
  requireId,
  getRecordOrNull,
  resolveClassBranchId
} from '../../shared/classAccess.ts';

// Admin view of ONE scheduled session.
//
// Authorization is independent of listClasses: knowing or guessing a class id
// proves nothing. Order:
//   1. authenticate
//   2. confirm an active Academy Admin role
//   3. resolve the Admin's branch scope
//   4. load the class (service role) and resolve the branch it belongs to
//   5. confirm that branch is inside the scope, else 404 (same answer as missing,
//      so the endpoint cannot be used to probe other branches)
//
// Supported input: { class_id } only.
const ALLOWED_PARAMS = ['class_id'];

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

    const unknown = rejectUnknownParams(bodyRes.body, ALLOWED_PARAMS);
    if (unknown.error) return unknown.error;

    const classId = requireId(bodyRes.body.class_id, 'class_id');
    if (classId.error) return classId.error;

    const scope = await resolveAdminBranchScope(base44, auth.user.id);
    if (isScopeEmpty(scope)) {
      return jsonError(403, 'No branch is assigned to your admin account');
    }

    const cls = await getRecordOrNull(base44, 'Class', classId.value);
    if (!cls) return jsonError(404, 'Class not found');

    const branchId = await resolveClassBranchId(base44, cls, {});
    if (!branchId || !scope.branchIds.includes(branchId)) {
      return jsonError(404, 'Class not found');
    }

    const [locations, coaches] = await Promise.all([
      loadAdminLocations(base44, scope),
      loadAdminCoaches(base44, roles)
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
    if (cls.coach_id && !coachNames[cls.coach_id]) {
      const users = await resolveUserMap(base44, [cls.coach_id]);
      const name = displayName(users[cls.coach_id]);
      if (name) coachNames[cls.coach_id] = name;
    }

    const venue = locations.find((item) => item.id === cls.location_id);

    // A session generated from a Class Group keeps a historical link to it. The
    // group is shown for context only; it never rewrites this session.
    let classGroup = null;
    if (cls.class_group_id) {
      const group = await getRecordOrNull(base44, 'ClassGroup', cls.class_group_id);
      if (group) {
        classGroup = {
          id: group.id,
          name: group.name || null,
          day_label: DAY_OF_WEEK_LABELS[group.day_of_week] || null,
          start_time: group.start_time || null,
          end_time: group.end_time || null,
          is_active: group.is_active !== false
        };
      }
    }

    return Response.json(
      {
        class_group: classGroup,
        class: projectAdminClass(cls, buildClassContext({
          locationNames,
          branchNames,
          coachNames,
          activeCoachIds,
          today: todayInAcademyZone()
        })),
        can_edit: (cls.status || 'scheduled') === 'scheduled',
        venue: venue || null,
        options: {
          branches: (scope.branches || []).map((branch) => ({
            id: branch.id,
            name: branch.name,
            code: branch.code || null
          })),
          locations,
          coaches
        },
        scope: { all_branches: scope.allBranches, branch_ids: scope.branchIds }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[getClass] unexpected failure', error && (error.stack || error.message || error));
    return serverFailure('getClass');
  }
}