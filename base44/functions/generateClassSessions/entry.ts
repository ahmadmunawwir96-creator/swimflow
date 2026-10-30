import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  authenticateCaller,
  readObjectBody,
  rejectUnknownParams,
  jsonError,
  serverFailure
} from '../../shared/directoryAccess.ts';
import { resolveAdminBranchScope, isScopeEmpty } from '../../shared/adminScope.ts';
import { getActiveAssignment } from '../../shared/academyRoles.ts';
import { readAllPages, READ_PAGE_SIZE } from '../../shared/pagination.ts';
import {
  createRoleCache,
  authorizeAcademyAdminWithCache,
  requireId,
  requireDate,
  requireTime,
  requireCapacity,
  minutesOf,
  daysBetween,
  findCoachConflicts,
  summariseConflicts,
  getRecordOrNull,
  writeClassAudit,
  buildClassContext,
  displayName,
  resolveCategoryLevel,
  DAY_OF_WEEK_LABELS
} from '../../shared/classAccess.ts';
import {
  weeklySessionDates,
  projectClassGroup,
  MAX_GENERATION_RANGE_DAYS,
  MAX_GENERATED_SESSIONS
} from '../../shared/classGroups.ts';

// Create the dated Class sessions for one Class Group between two dates.
//
// Deliberately simple: the admin picks a start and an end date and the system
// creates one session per week on the group's weekday. No recurrence engine.
//
// Guarantees:
//   - a session already existing for (group, date) is NEVER duplicated and NEVER
//     overwritten, whatever its status — a date the academy cancelled stays
//     cancelled instead of silently coming back
//   - a date where the group's coach is already teaching an overlapping session is
//     skipped and reported, not created as a clash
//   - nothing is created for a group whose venue or coach has since become unusable
//
// Supported input: { class_group_id, from, to }.
const ALLOWED_PARAMS = ['class_group_id', 'from', 'to'];

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

    const groupId = requireId(body.class_group_id, 'class_group_id');
    if (groupId.error) return groupId.error;
    const from = requireDate(body.from, 'from');
    if (from.error) return from.error;
    const to = requireDate(body.to, 'to');
    if (to.error) return to.error;
    if (to.value < from.value) {
      return jsonError(400, 'The end date must be on or after the start date');
    }
    if (daysBetween(from.value, to.value) > MAX_GENERATION_RANGE_DAYS) {
      return jsonError(400, `Please choose a date range of ${MAX_GENERATION_RANGE_DAYS} days or fewer`);
    }

    const scope = await resolveAdminBranchScope(base44, auth.user.id);
    if (isScopeEmpty(scope)) {
      return jsonError(403, 'No branch is assigned to your admin account');
    }

    const group = await getRecordOrNull(base44, 'ClassGroup', groupId.value);
    if (!group) return jsonError(404, 'Class group not found');
    // Same answer for "outside my branches" as for "does not exist", so the
    // endpoint cannot be used to probe another branch.
    const groupBranchId = group.branch_id || null;
    if (!groupBranchId || !scope.branchIds.includes(groupBranchId)) {
      return jsonError(404, 'Class group not found');
    }

    if (group.is_active === false) {
      return jsonError(400, 'This class group is inactive. Activate it before creating sessions.');
    }
    // Stored weekday must already be a whole number 0..6. A fractional, textual or
    // out-of-range value is refused rather than rounded, parsed or shifted onto a
    // real weekday, so sessions can never land on a day the group did not mean.
    if (!Number.isInteger(group.day_of_week) || group.day_of_week < 0 || group.day_of_week > 6) {
      return jsonError(409, 'This class group has no valid weekday set. Update the class group before creating sessions.');
    }
    const storedStart = requireTime(group.start_time, 'start_time');
    const storedEnd = requireTime(group.end_time, 'end_time');
    if (storedStart.error || storedEnd.error) {
      return jsonError(409, 'This class group has no usable time. Update it before creating sessions.');
    }
    if (minutesOf(group.end_time) <= minutesOf(group.start_time)) {
      return jsonError(409, 'This class group has no valid start and end time. Update it before creating sessions.');
    }
    if (!group.location_id) {
      return jsonError(409, 'This class group has no venue. Update it before creating sessions.');
    }
    const venue = await getRecordOrNull(base44, 'Location', group.location_id);
    if (!venue) {
      return jsonError(409, 'The venue for this class group no longer exists. Update the class group before creating sessions.');
    }
    if (venue.is_active === false) {
      return jsonError(409, 'The venue for this class group is inactive. Reactivate it or choose another venue before creating sessions.');
    }
    if (!venue.branch_id || !scope.branchIds.includes(venue.branch_id)) {
      return jsonError(409, 'The venue for this class group is no longer in your branches. Update the class group.');
    }
    if (!group.coach_id) {
      return jsonError(409, 'This class group has no coach. Update it before creating sessions.');
    }
    const coachUser = await getRecordOrNull(base44, 'User', group.coach_id);
    if (!coachUser) {
      return jsonError(409, 'The coach for this class group no longer exists. Update the class group before creating sessions.');
    }
    const coachRole = await roles.get('coach');
    const coachAssignment = coachRole
      ? await getActiveAssignment(base44, group.coach_id, coachRole.id)
      : null;
    if (!coachAssignment) {
      return jsonError(409, 'That coach no longer has an active Coach role. Update the class group before creating sessions.');
    }

    // The group's own category/level rule must still hold: a group whose category
    // or level was left inconsistent is not silently defaulted into something else.
    const groupCategoryLevel = resolveCategoryLevel(group.class_category, group.skill_level);
    if (groupCategoryLevel.error) {
      return jsonError(
        409,
        'This class group has no valid class category and level. Update the class group before creating sessions.'
      );
    }

    // Stored class size must already satisfy the same rule a newly saved class does
    // (whole number, MIN_CAPACITY..MAX_CAPACITY via requireCapacity). A missing,
    // non-numeric, fractional or out-of-range stored value is never defaulted or
    // corrected into a session: the admin fixes the group first. No coercion, so a
    // stored numeric string is refused instead of being parsed.
    const capacityInvalid = jsonError(
      409,
      'This class group has no valid class size. Update the class group before creating sessions.'
    );
    if (typeof group.max_capacity !== 'number') return capacityInvalid;
    const storedCapacity = requireCapacity(group.max_capacity);
    if (storedCapacity.error) return capacityInvalid;

    const dates = weeklySessionDates(from.value, to.value, group.day_of_week);
    if (!dates.length) {
      const dayLabel = DAY_OF_WEEK_LABELS[group.day_of_week] || 'chosen weekday';
      return jsonError(400, `That date range contains no ${dayLabel}. Choose a range that includes one.`);
    }
    if (dates.length > MAX_GENERATED_SESSIONS) {
      return jsonError(
        400,
        `That range would create ${dates.length} sessions. Please generate ${MAX_GENERATED_SESSIONS} sessions or fewer at a time.`
      );
    }

    // ---- duplicate protection: whatever already exists wins, always ----
    // Reads EVERY existing session in the range, across pages. A single page would
    // let a date past the boundary look free and create a duplicate; a cancelled
    // session counts here too, which is why its status is deliberately not filtered.
    const existingRows = await readAllPages(
      ({ cursor }) =>
        base44.asServiceRole.entities.Class.filter(
          { class_group_id: group.id, class_date: { $gte: from.value, $lte: to.value } },
          { limit: READ_PAGE_SIZE, sort: 'class_date', cursor }
        ),
      { label: 'existing group sessions' }
    );
    const existingDates = new Set(
      existingRows
        .map((row) => row.class_date)
        .filter(Boolean)
    );

    // ---- coach overlap on the dates being created ----
    const coachConflicts = await findCoachConflicts(base44, {
      class_dates: dates,
      coach_id: group.coach_id,
      start_time: group.start_time,
      end_time: group.end_time
    });
    const conflictsByDate = {};
    coachConflicts.forEach((row) => {
      if (!conflictsByDate[row.class_date]) conflictsByDate[row.class_date] = [];
      conflictsByDate[row.class_date].push(row);
    });

    const skippedExisting = dates.filter((date) => existingDates.has(date));
    const skippedBusy = dates
      .filter((date) => !existingDates.has(date) && conflictsByDate[date])
      .map((date) => ({ date, conflicts: summariseConflicts(conflictsByDate[date]) }));
    const toCreate = dates.filter((date) => !existingDates.has(date) && !conflictsByDate[date]);

    const label = group.name || 'Class';
    if (toCreate.length) {
      await base44.asServiceRole.entities.Class.bulkCreate(
        toCreate.map((date) => ({
          name: label,
          class_date: date,
          start_time: group.start_time,
          end_time: group.end_time,
          location_id: venue.id,
          branch_id: venue.branch_id,
          coach_id: group.coach_id,
          class_group_id: group.id,
          // Snapshot: the session keeps its own category and level from now on, so a
          // later change to the group never rewrites this history.
          class_category: groupCategoryLevel.value.category,
          skill_level: groupCategoryLevel.value.level,
          // Snapshot: the validated stored size, copied exactly as validated.
          max_capacity: storedCapacity.value,
          notes: group.notes || null,
          status: 'scheduled'
        }))
      );
    }

    if (toCreate.length || skippedExisting.length || skippedBusy.length) {
      await writeClassAudit(base44, auth.user, {
        action: 'class_sessions_generated',
        target_type: 'class_group',
        target_id: group.id,
        branch_id: venue.branch_id,
        summary: `Created ${toCreate.length} session(s) for ${label} between ${from.value} and ${to.value}`,
        details: {
          created: toCreate,
          skipped_existing: skippedExisting,
          skipped_coach_busy: skippedBusy.map((item) => item.date),
          group_name: label
        }
      });
    }

    const locationNames = { [venue.id]: venue.name };
    const branchNames = {};
    (scope.branches || []).forEach((branch) => {
      branchNames[branch.id] = branch.name;
    });
    const coachNames = {};
    const activeCoachIds = new Set([group.coach_id]);
    const coachName = displayName(coachUser);
    if (coachName) coachNames[group.coach_id] = coachName;

    return Response.json(
      {
        class_group: projectClassGroup(group, buildClassContext({ locationNames, branchNames, coachNames, activeCoachIds })),
        range: { from: from.value, to: to.value },
        created: toCreate,
        created_count: toCreate.length,
        skipped_existing: skippedExisting,
        skipped_coach_busy: skippedBusy
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[generateClassSessions] unexpected failure', error && (error.stack || error.message || error));
    return serverFailure('generateClassSessions');
  }
}