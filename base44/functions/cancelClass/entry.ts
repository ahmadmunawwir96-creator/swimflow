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
  optionalText,
  parseCancellationType,
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
        : { previous: { cancellation_type: cls.cancellation_type || null, cancellation_reason: cls.cancellation_reason || null } }
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