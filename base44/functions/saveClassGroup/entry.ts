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
  requireId,
  optionalId,
  optionalText,
  requireTime,
  requireCapacity,
  requireLevel,
  requireDayOfWeek,
  minutesOf,
  resolveAuthorizedVenue,
  resolveActiveCoach,
  getRecordOrNull,
  writeClassAudit,
  displayName,
  buildClassContext,
  MAX_NAME_LENGTH
} from '../../shared/classAccess.ts';
import {
  MAX_GROUP_NOTES_LENGTH,
  defaultGroupName,
  projectClassGroup
} from '../../shared/classGroups.ts';

// Create, edit or deactivate a Class Group (the recurring weekly timetable row).
//
// Rules:
//   - the venue must exist, be active and sit in one of the caller's branches
//   - the branch is derived from the venue; a client branch_id is rejected by
//     rejectUnknownParams and never honoured
//   - the coach is required and must currently hold an active Coach role
//   - deactivating is is_active = false; a group is never deleted, so the sessions
//     it generated keep their link
//
// Editing a group does NOT touch a single existing session. Future generation
// reads the new values; history stays as it was.
//
// Supported input: { class_group_id?, location_id, coach_id, skill_level,
// day_of_week, start_time, end_time, max_capacity, name?, notes?, is_active? }
const ALLOWED_PARAMS = [
  'class_group_id',
  'location_id',
  'coach_id',
  'skill_level',
  'day_of_week',
  'start_time',
  'end_time',
  'max_capacity',
  'name',
  'notes',
  'is_active'
];

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

    const locationId = requireId(body.location_id, 'location_id');
    if (locationId.error) return locationId.error;
    const coachId = requireId(body.coach_id, 'coach_id');
    if (coachId.error) {
      return jsonError(400, 'Every class group needs a coach. Choose one from the list.');
    }
    const level = requireLevel(body.skill_level);
    if (level.error) return level.error;
    const dayOfWeek = requireDayOfWeek(body.day_of_week);
    if (dayOfWeek.error) return dayOfWeek.error;
    const startTime = requireTime(body.start_time, 'start_time');
    if (startTime.error) return startTime.error;
    const endTime = requireTime(body.end_time, 'end_time');
    if (endTime.error) return endTime.error;
    if (minutesOf(endTime.value) <= minutesOf(startTime.value)) {
      return jsonError(400, 'The end time must be after the start time');
    }
    const capacity = requireCapacity(body.max_capacity);
    if (capacity.error) return capacity.error;
    const name = optionalText(body.name, 'name', MAX_NAME_LENGTH);
    if (name.error) return name.error;
    const notes = optionalText(body.notes, 'notes', MAX_GROUP_NOTES_LENGTH);
    if (notes.error) return notes.error;
    const classGroupId = optionalId(body.class_group_id, 'class_group_id');
    if (classGroupId.error) return classGroupId.error;
    if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
      return jsonError(400, 'is_active must be true or false');
    }
    const isActive = body.is_active !== false;

    const scope = await resolveAdminBranchScope(base44, auth.user.id);
    if (isScopeEmpty(scope)) {
      return jsonError(403, 'No branch is assigned to your admin account');
    }

    const venueRes = await resolveAuthorizedVenue(base44, locationId.value, scope);
    if (venueRes.error) return venueRes.error;
    const venue = venueRes.venue;

    const coachRes = await resolveActiveCoach(base44, roles, coachId.value);
    if (coachRes.error) return coachRes.error;
    const coachUser = coachRes.user;

    let existing = null;
    if (classGroupId.value) {
      existing = await getRecordOrNull(base44, 'ClassGroup', classGroupId.value);
      if (!existing) return jsonError(404, 'Class group not found');
      const existingBranch = existing.branch_id || null;
      if (!existingBranch || !scope.branchIds.includes(existingBranch)) {
        return jsonError(404, 'Class group not found');
      }
    }

    const label = name.value || defaultGroupName(level.value, dayOfWeek.value);
    const payload = {
      name: label,
      location_id: venue.id,
      branch_id: venue.branch_id,
      coach_id: coachId.value,
      skill_level: level.value,
      day_of_week: dayOfWeek.value,
      start_time: startTime.value,
      end_time: endTime.value,
      max_capacity: capacity.value,
      notes: notes.value || null,
      is_active: isActive
    };

    const saved = existing
      ? await base44.asServiceRole.entities.ClassGroup.update(existing.id, payload)
      : await base44.asServiceRole.entities.ClassGroup.create(payload);

    const deactivated = Boolean(existing) && existing.is_active !== false && isActive === false;
    const reactivated = Boolean(existing) && existing.is_active === false && isActive === true;

    await writeClassAudit(base44, auth.user, {
      action: !existing
        ? 'class_group_created'
        : deactivated
          ? 'class_group_deactivated'
          : reactivated
            ? 'class_group_reactivated'
            : 'class_group_updated',
      target_type: 'class_group',
      target_id: saved.id,
      branch_id: venue.branch_id,
      summary: !existing
        ? `Created class group ${label}`
        : deactivated
          ? `Deactivated class group ${label}`
          : reactivated
            ? `Reactivated class group ${label}`
            : `Updated class group ${label}`,
      details: {
        ...payload,
        coach_name: displayName(coachUser),
        before: existing
          ? {
              location_id: existing.location_id || null,
              coach_id: existing.coach_id || null,
              skill_level: existing.skill_level || null,
              day_of_week: existing.day_of_week ?? null,
              start_time: existing.start_time || null,
              end_time: existing.end_time || null,
              max_capacity: existing.max_capacity ?? null,
              name: existing.name || null,
              is_active: existing.is_active !== false
            }
          : null
      }
    });

    const locationNames = { [venue.id]: venue.name };
    const branchNames = {};
    (scope.branches || []).forEach((branch) => {
      branchNames[branch.id] = branch.name;
    });
    const coachNames = {};
    const activeCoachIds = new Set([coachId.value]);
    const resolvedName = displayName(coachUser);
    if (resolvedName) coachNames[coachId.value] = resolvedName;

    return Response.json(
      {
        class_group: projectClassGroup(saved, buildClassContext({ locationNames, branchNames, coachNames, activeCoachIds }))
      },
      { status: existing ? 200 : 201 }
    );
  } catch (error) {
    console.error('[saveClassGroup] unexpected failure', error && (error.stack || error.message || error));
    return serverFailure('saveClassGroup');
  }
}