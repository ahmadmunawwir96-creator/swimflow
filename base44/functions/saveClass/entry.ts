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
  requireDate,
  requireTime,
  requireCapacity,
  requireLevel,
  minutesOf,
  findCoachConflicts,
  coachConflictResponse,
  getRecordOrNull,
  resolveClassBranchId,
  resolveAuthorizedVenue,
  resolveActiveCoach,
  writeClassAudit,
  projectAdminClass,
  buildClassContext,
  displayName,
  todayInAcademyZone,
  LEVEL_LABELS,
  MAX_NAME_LENGTH,
  MAX_NOTES_LENGTH
} from '../../shared/classAccess.ts';

// Create or edit one dated session.
//
// Nothing relationship-shaped is trusted from the browser:
//   - the venue is loaded and must exist, be active and sit in an authorized branch
//   - the branch is derived from that venue (a client branch_id is rejected
//     outright by rejectUnknownParams)
//   - the coach is REQUIRED and must exist and hold an active Coach role
//   - the coach may not already be teaching an overlapping session
//
// Several sessions may share the same venue at the same time — the academy runs
// one class per coach on duty — so a shared venue is never a conflict.
//
// class_group_id is never accepted here. It is written by generateClassSessions,
// and an existing link is preserved on edit so a session never drifts away from
// the group it came from.
//
// Supported input: location_id, coach_id, skill_level, class_date, start_time,
// end_time, max_capacity, optional class_id, name, notes.
const ALLOWED_PARAMS = [
  'class_id',
  'location_id',
  'coach_id',
  'skill_level',
  'class_date',
  'start_time',
  'end_time',
  'max_capacity',
  'name',
  'notes'
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

    const scope = await resolveAdminBranchScope(base44, auth.user.id);
    if (isScopeEmpty(scope)) {
      return jsonError(403, 'No branch is assigned to your admin account');
    }

    // ---- field validation (nothing is silently corrected) ----
    const locationId = requireId(body.location_id, 'location_id');
    if (locationId.error) return locationId.error;
    const coachId = requireId(body.coach_id, 'coach_id');
    if (coachId.error) {
      return jsonError(400, 'Every class needs a coach. Choose one from the list.');
    }
    const level = requireLevel(body.skill_level);
    if (level.error) return level.error;
    const classDate = requireDate(body.class_date, 'class_date');
    if (classDate.error) return classDate.error;
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
    const notes = optionalText(body.notes, 'notes', MAX_NOTES_LENGTH);
    if (notes.error) return notes.error;
    const classId = optionalId(body.class_id, 'class_id');
    if (classId.error) return classId.error;

    // ---- venue: existence, activity, branch, scope ----
    const venueRes = await resolveAuthorizedVenue(base44, locationId.value, scope);
    if (venueRes.error) return venueRes.error;
    const venue = venueRes.venue;

    // ---- coach: existence + active Coach role ----
    const coachRes = await resolveActiveCoach(base44, roles, coachId.value);
    if (coachRes.error) return coachRes.error;
    const coachUser = coachRes.user;

    // ---- existing class (edit) ----
    let existing = null;
    if (classId.value) {
      existing = await getRecordOrNull(base44, 'Class', classId.value);
      if (!existing) return jsonError(404, 'Class not found');
      const existingBranch = await resolveClassBranchId(base44, existing, {});
      if (!existingBranch || !scope.branchIds.includes(existingBranch)) {
        return jsonError(404, 'Class not found');
      }
      if ((existing.status || 'scheduled') === 'cancelled') {
        return jsonError(409, 'This class is cancelled. Restore it before editing.');
      }
    }

    // ---- coach conflict (the only scheduling conflict) ----
    const coachConflicts = await findCoachConflicts(base44, {
      class_date: classDate.value,
      start_time: startTime.value,
      end_time: endTime.value,
      coach_id: coachId.value,
      exclude_id: classId.value || null
    });
    const conflictFailure = coachConflictResponse(coachConflicts);
    if (conflictFailure) return conflictFailure;

    const label = name.value || `${LEVEL_LABELS[level.value]} class`;
    const payload = {
      name: label,
      location_id: venue.id,
      branch_id: venue.branch_id,
      coach_id: coachId.value,
      skill_level: level.value,
      class_date: classDate.value,
      start_time: startTime.value,
      end_time: endTime.value,
      max_capacity: capacity.value,
      notes: notes.value || null
    };

    let saved;
    if (existing) {
      saved = await base44.asServiceRole.entities.Class.update(existing.id, payload);
    } else {
      saved = await base44.asServiceRole.entities.Class.create({ ...payload, status: 'scheduled' });
    }

    // ---- audit (one entry per category of change) ----
    const branchName = (scope.branches || []).find((branch) => branch.id === venue.branch_id);
    const branchLabel = branchName ? branchName.name : null;

    if (!existing) {
      await writeClassAudit(base44, auth.user, {
        action: 'class_created',
        target_id: saved.id,
        branch_id: venue.branch_id,
        summary: `Created ${label} on ${classDate.value} ${startTime.value}-${endTime.value} at ${venue.name}`,
        details: {
          ...payload,
          branch_name: branchLabel,
          coach_name: displayName(coachUser)
        }
      });
    } else {
      const coachChanged = (existing.coach_id || null) !== coachId.value;
      const locationChanged = (existing.location_id || null) !== venue.id;
      const otherFields = ['name', 'skill_level', 'class_date', 'start_time', 'end_time', 'max_capacity', 'notes'];
      const changedFields = otherFields.filter((field) => {
        const before = existing[field] === undefined ? null : existing[field];
        const after = payload[field] === undefined ? null : payload[field];
        return String(before === null ? '' : before) !== String(after === null ? '' : after);
      });

      if (coachChanged) {
        await writeClassAudit(base44, auth.user, {
          action: 'class_coach_changed',
          target_id: saved.id,
          branch_id: venue.branch_id,
          summary: `Coach changed for ${label} on ${classDate.value} ${startTime.value}`,
          details: { before: existing.coach_id || null, after: coachId.value, coach_name: displayName(coachUser) }
        });
      }
      if (locationChanged) {
        await writeClassAudit(base44, auth.user, {
          action: 'class_location_changed',
          target_id: saved.id,
          branch_id: venue.branch_id,
          summary: `Venue changed for ${label} on ${classDate.value} ${startTime.value} to ${venue.name}`,
          details: { before: existing.location_id || null, after: venue.id, branch_name: branchLabel }
        });
      }
      if (changedFields.length) {
        const before = {};
        const after = {};
        changedFields.forEach((field) => {
          before[field] = existing[field] === undefined ? null : existing[field];
          after[field] = payload[field] === undefined ? null : payload[field];
        });
        await writeClassAudit(base44, auth.user, {
          action: 'class_updated',
          target_id: saved.id,
          branch_id: venue.branch_id,
          summary: `Updated ${label} on ${classDate.value} ${startTime.value}-${endTime.value}`,
          details: { changed: changedFields, before, after }
        });
      }
    }

    const locationNames = { [venue.id]: venue.name };
    const branchNames = {};
    (scope.branches || []).forEach((branch) => {
      branchNames[branch.id] = branch.name;
    });
    const coachNames = {};
    const activeCoachIds = new Set();
    const resolvedName = displayName(coachUser);
    if (resolvedName) coachNames[coachId.value] = resolvedName;
    activeCoachIds.add(coachId.value);

    return Response.json(
      {
        class: projectAdminClass(saved, buildClassContext({
          locationNames,
          branchNames,
          coachNames,
          activeCoachIds,
          today: todayInAcademyZone()
        }))
      },
      { status: existing ? 200 : 201 }
    );
  } catch (error) {
    console.error('[saveClass] unexpected failure', error && (error.stack || error.message || error));
    return serverFailure('saveClass');
  }
}