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
  requireDate,
  requireTime,
  optionalText,
  parseCancellationType,
  minutesOf,
  findCoachConflicts,
  coachConflictResponse,
  getRecordOrNull,
  resolveClassBranchId,
  writeClassAudit,
  MAX_REASON_LENGTH,
  CANCELLATION_TYPE_LABELS
} from '../../shared/classAccess.ts';

// Cancel a scheduled session, or reverse a cancellation that was made in error.
//
// A cancelled class is never deleted: the record keeps its date, venue, coach and
// capacity, plus who cancelled it, when and why. That is what later token
// restoration, attendance and reporting will need.
//
// Restoring is NOT a plain status flip. A cancelled class is invisible to the
// conflict checks, so time may have moved on while it sat cancelled and its coach
// may now teach something else at that hour. Before restoring we therefore
// re-run the same coach rule as creating a class (coachConflictResponse in
// classAccess.ts — one shared rule, not a second copy).
//
// A shared venue is never a reason to refuse: several classes normally run at the
// same pool at the same time.
//
// A cancelled class may keep an inactive venue (history is preserved), but it may
// never become scheduled at one: restoring into a switched-off venue is a hard
// refusal (409) and leaves the record completely untouched.
//
// The coach's *role* is deliberately not re-validated here: a cancelled class
// cannot be edited, so a revoked Coach role would otherwise make restoration
// impossible. The admin restores first, then reassigns the coach.
//
// Supported input: { class_id, cancel (default true), cancellation_type,
// cancellation_reason }.
const ALLOWED_PARAMS = ['class_id', 'cancel', 'cancellation_type', 'cancellation_reason'];

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

    const classId = requireId(body.class_id, 'class_id');
    if (classId.error) return classId.error;

    if (body.cancel !== undefined && typeof body.cancel !== 'boolean') {
      return jsonError(400, 'cancel must be true or false');
    }
    const cancel = body.cancel !== false;

    let cancellationType = { value: null };
    if (cancel) {
      cancellationType = parseCancellationType(body.cancellation_type);
      if (cancellationType.error) return cancellationType.error;
    }
    const reason = optionalText(body.cancellation_reason, 'cancellation_reason', MAX_REASON_LENGTH);
    if (reason.error) return reason.error;

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

    const currentStatus = cls.status || 'scheduled';
    if (cancel && currentStatus === 'cancelled') {
      return jsonError(409, 'This class is already cancelled.');
    }
    if (!cancel && currentStatus !== 'cancelled') {
      return jsonError(409, 'This class is not cancelled.');
    }

    // ---- restore validation (only when reversing a cancellation) ----
    // Nothing on the cancelled record is modified until every check below passes.
    if (!cancel) {
      const storedDate = requireDate(cls.class_date, 'class_date');
      const storedStart = requireTime(cls.start_time, 'start_time');
      const storedEnd = requireTime(cls.end_time, 'end_time');
      if (storedDate.error || storedStart.error || storedEnd.error) {
        return jsonError(
          409,
          'This class has no usable date or time, so it cannot be restored. Create a new session instead.'
        );
      }
      if (minutesOf(cls.end_time) <= minutesOf(cls.start_time)) {
        return jsonError(409, 'This class has no valid start and end time, so it cannot be restored.');
      }

      if (!cls.location_id) {
        return jsonError(409, 'This class has no venue, so it cannot be restored.');
      }
      const venue = await getRecordOrNull(base44, 'Location', cls.location_id);
      if (!venue) {
        return jsonError(409, 'The venue for this class no longer exists. Create a new session at a current venue.');
      }
      if (!venue.branch_id || venue.branch_id !== branchId) {
        return jsonError(409, 'The venue for this class is no longer in the same branch. Create a new session instead.');
      }

      // The venue may have been deactivated while the class sat cancelled. A
      // cancelled class keeps it happily, but a scheduled class must not sit in a
      // venue that is switched off. Refused before any write, so the record keeps its
      // cancellation; the admin reactivates the venue or creates a session elsewhere.
      if (venue.is_active === false) {
        return jsonError(
          409,
          'This venue is inactive. Reactivate the venue or create the class at an active venue before restoring it.'
        );
      }

      // A real class always has a coach, so a session cannot come back to life
      // without one.
      if (!cls.coach_id) {
        return jsonError(409, 'This class has no coach, so it cannot be restored. Create a new session instead.');
      }
      const coachUser = await getRecordOrNull(base44, 'User', cls.coach_id);
      if (!coachUser) {
        return jsonError(
          409,
          'The coach for this class no longer exists, so it cannot be restored. Create a new session instead.'
        );
      }

      const coachConflicts = await findCoachConflicts(base44, {
        class_date: cls.class_date,
        start_time: cls.start_time,
        end_time: cls.end_time,
        coach_id: cls.coach_id,
        exclude_id: cls.id
      });
      const conflictFailure = coachConflictResponse(coachConflicts);
      if (conflictFailure) return conflictFailure;
    }

    const payload = cancel
      ? {
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: auth.user.id,
          cancellation_type: cancellationType.value,
          cancellation_reason: reason.value || null
        }
      : {
          status: 'scheduled',
          cancelled_at: null,
          cancelled_by: null,
          cancellation_type: null,
          cancellation_reason: null
        };

    const saved = await base44.asServiceRole.entities.Class.update(cls.id, payload);

    await writeClassAudit(base44, auth.user, {
      action: cancel ? 'class_cancelled' : 'class_cancellation_reversed',
      target_id: cls.id,
      branch_id: branchId,
      summary: cancel
        ? `Cancelled ${cls.name || 'class'} on ${cls.class_date} ${cls.start_time || ''} (${CANCELLATION_TYPE_LABELS[cancellationType.value]})`.trim()
        : `Reversed cancellation of ${cls.name || 'class'} on ${cls.class_date} ${cls.start_time || ''}`.trim(),
      details: cancel
        ? { cancellation_type: cancellationType.value, cancellation_reason: reason.value || null }
        : {
            previous: {
              cancellation_type: cls.cancellation_type || null,
              cancellation_reason: cls.cancellation_reason || null
            },
            restored_to: 'scheduled'
          }
    });

    return Response.json(
      {
        class_id: saved.id,
        status: saved.status || 'scheduled',
        cancellation: (saved.status === 'cancelled')
          ? {
              at: saved.cancelled_at || null,
              type: saved.cancellation_type || null,
              type_label: CANCELLATION_TYPE_LABELS[saved.cancellation_type] || null,
              reason: saved.cancellation_reason || null
            }
          : null
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[cancelClass] unexpected failure', error && (error.stack || error.message || error));
    return serverFailure('cancelClass');
  }
}