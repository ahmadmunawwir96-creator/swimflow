import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  authenticateCaller,
  readObjectBody,
  rejectUnknownParams,
  jsonError,
  serverFailure,
  toPage,
  parseCursor,
  parseBranchId
} from '../../shared/directoryAccess.ts';
import { resolveAdminBranchScope, isScopeEmpty } from '../../shared/adminScope.ts';
import { resolveUserMap } from '../../shared/academyRoles.ts';
import {
  createRoleCache,
  authorizeAcademyAdminWithCache,
  requireDate,
  todayInAcademyZone,
  addDays,
  daysBetween,
  MAX_CLASS_WINDOW_DAYS,
  parseClassPageSize,
  parseClassStatusFilter,
  loadAdminLocations,
  loadAdminCoaches,
  projectAdminClass,
  buildClassContext,
  displayName,
  requireId,
  optionalId
} from '../../shared/classAccess.ts';

// Admin schedule: the sessions an Admin may see, within their branch scope.
//
// Authorization order is the same as the student directory:
//   1. authenticate the caller
//   2. confirm an active Academy Admin role (server-side, from UserRole)
//   3. resolve the Admin's branch scope from their own records
//   4. only then read classes with the service role
//
// A class belongs to a Branch through its venue. branch_id on the class is a
// server-derived snapshot written by saveClass, so filtering by scope needs no
// per-class venue lookup. A branch supplied by the browser can only NARROW the
// result and is refused when it is outside the caller's scope.
//
// Supported input (all optional): from, to, branch_id, location_id, coach_id,
// status, limit, cursor.
const ALLOWED_PARAMS = ['from', 'to', 'branch_id', 'location_id', 'coach_id', 'status', 'limit', 'cursor'];

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
    const body = bodyRes.body;

    const unknown = rejectUnknownParams(body, ALLOWED_PARAMS);
    if (unknown.error) return unknown.error;

    const today = todayInAcademyZone();
    const from = body.from ? requireDate(body.from, 'from') : { value: today };
    if (from.error) return from.error;
    const to = body.to ? requireDate(body.to, 'to') : { value: addDays(from.value, 29) };
    if (to.error) return to.error;
    if (to.value < from.value) {
      return jsonError(400, 'The end date must be on or after the start date');
    }
    if (daysBetween(from.value, to.value) > MAX_CLASS_WINDOW_DAYS) {
      return jsonError(400, `Please choose a date range of ${MAX_CLASS_WINDOW_DAYS} days or fewer`);
    }

    const limit = parseClassPageSize(body.limit);
    if (limit.error) return limit.error;
    const status = parseClassStatusFilter(body.status);
    if (status.error) return status.error;
    const cursor = parseCursor(body.cursor);
    if (cursor.error) return cursor.error;
    const branchFilter = parseBranchId(body.branch_id);
    if (branchFilter.error) return branchFilter.error;
    const locationFilter = optionalId(body.location_id, 'location_id');
    if (locationFilter.error) return locationFilter.error;
    const coachFilter = optionalId(body.coach_id, 'coach_id');
    if (coachFilter.error) return coachFilter.error;

    const scope = await resolveAdminBranchScope(base44, auth.user.id);
    if (isScopeEmpty(scope)) {
      return jsonError(403, 'No branch is assigned to your admin account');
    }
    if (branchFilter.value && !scope.branchIds.includes(branchFilter.value)) {
      return jsonError(403, 'That branch is not in your administrator scope');
    }

    const [locations, coaches] = await Promise.all([
      loadAdminLocations(base44, scope),
      loadAdminCoaches(base44, roles)
    ]);

    // A venue outside scope is refused rather than merged into the query.
    if (locationFilter.value && !locations.some((venue) => venue.id === locationFilter.value)) {
      return jsonError(403, 'That venue is not in your administrator scope');
    }
    if (coachFilter.value) {
      const coachCheck = requireId(coachFilter.value, 'coach_id');
      if (coachCheck.error) return coachCheck.error;
    }

    const query = { class_date: { $gte: from.value, $lte: to.value } };
    if (status.value) query.status = status.value;
    query.branch_id = branchFilter.value ? branchFilter.value : { $in: scope.branchIds };
    if (locationFilter.value) query.location_id = locationFilter.value;
    if (coachFilter.value) query.coach_id = coachFilter.value;

    const options = { limit: limit.value, sort: 'class_date' };
    if (cursor.value) options.cursor = cursor.value;

    let page;
    try {
      page = toPage(await base44.asServiceRole.entities.Class.filter(query, options));
    } catch (e) {
      if (cursor.value) return jsonError(400, 'Invalid pagination cursor');
      throw e;
    }

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

    // A class may reference a coach whose Coach role was revoked later. Those
    // names are resolved once for the page instead of showing a blank.
    const unknownCoachIds = [
      ...new Set(page.items.map((row) => row.coach_id).filter((id) => id && !coachNames[id]))
    ];
    if (unknownCoachIds.length) {
      const users = await resolveUserMap(base44, unknownCoachIds);
      unknownCoachIds.forEach((id) => {
        const name = displayName(users[id]);
        if (name) coachNames[id] = name;
      });
    }

    const ctx = buildClassContext({ locationNames, branchNames, coachNames, activeCoachIds, today });

    const rows = page.items
      .slice()
      .sort((a, b) =>
        a.class_date === b.class_date
          ? String(a.start_time || '').localeCompare(String(b.start_time || ''))
          : String(a.class_date || '') < String(b.class_date || '')
            ? -1
            : 1
      );

    return Response.json(
      {
        classes: rows.map((row) => projectAdminClass(row, ctx)),
        window: { from: from.value, to: to.value },
        today,
        applied: {
          branch_id: branchFilter.value,
          location_id: locationFilter.value,
          coach_id: coachFilter.value,
          status: status.value
        },
        has_more: page.has_more,
        next_cursor: page.next_cursor,
        limit: limit.value,
        scope: { all_branches: scope.allBranches, branch_ids: scope.branchIds },
        branches: (scope.branches || []).map((branch) => ({
          id: branch.id,
          name: branch.name,
          code: branch.code || null
        })),
        locations,
        coaches
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[listClasses] unexpected failure', error && (error.stack || error.message || error));
    return serverFailure('listClasses');
  }
}