import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  authenticateCaller,
  authorizeAcademyAdmin,
  readObjectBody,
  rejectUnknownParams,
  jsonError,
  serverFailure,
  isNotFoundError,
  projectStudentDetail
} from '../../shared/directoryAccess.ts';
import { resolveAdminBranchScope, isStudentInScope, isScopeEmpty } from '../../shared/adminScope.ts';
import { requireString } from '../../shared/academyRoles.ts';
import { requireSwimmingLevel, parseSkillProgression } from '../../shared/studentProfile.ts';
import { serializeAuditDetails } from '../../shared/auditDetails.ts';

// The ONLY way a swimmer's level or progression notes change.
//
// A level is an assessment decision, so the member who owns the profile cannot set
// it, and neither can a coach or a parent. The four self-service profile functions
// reject these two fields outright; this endpoint is the single privileged path.
//
// Authorization is the academy Admin role, resolved server-side through the shared
// gate — deliberately NOT the built-in platform User.role === 'admin'. An active
// academy admin who owns a swimmer profile still uses its self-service endpoint for
// everything else; overlapping roles never widen this one.
//
// Order (identical to getStudent, so the two cannot drift):
//   1. authenticate the caller
//   2. confirm an active academy Admin role
//   3. validate the payload (nothing is read before it is known to be legal)
//   4. resolve the Admin's branch scope server-side
//   5. load the requested student (service role, only after 1-4)
//   6. confirm that student is in scope
//   7. write only the fields that actually change
//   8. append an audit entry, then return the approved projection
//
// A student outside scope answers 404 — the same answer as one that does not
// exist — so this endpoint cannot be used to probe other branches for ids.
//
// Supported input: { student_id, swimming_level?, skill_progression? }.
// Both fields are optional and omitted fields keep their stored value. Sending
// neither is refused. Sending null for either is refused (no destructive clearing;
// only an empty progression STRING clears the notes).
const ALLOWED_PARAMS = ['student_id', 'swimming_level', 'skill_progression'];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    const auth = await authenticateCaller(base44);
    if (auth.error) return auth.error;

    const gate = await authorizeAcademyAdmin(base44, auth.user);
    if (gate.error) return gate.error;

    const bodyRes = await readObjectBody(req);
    if (bodyRes.error) return bodyRes.error;
    const body = bodyRes.body;

    const unknown = rejectUnknownParams(body, ALLOWED_PARAMS);
    if (unknown.error) return unknown.error;

    const sid = requireString(body.student_id, 'student_id');
    if (sid.error) return sid.error;

    // ---- field validation, before the record is even read ----
    const patch: Record<string, any> = {};
    if (body.swimming_level !== undefined) {
      const level = requireSwimmingLevel(body.swimming_level);
      if (level.error) return level.error;
      patch.swimming_level = level.value;
    }
    if (body.skill_progression !== undefined) {
      const notes = parseSkillProgression(body.skill_progression);
      if (notes.error) return notes.error;
      patch.skill_progression = notes.value;
    }
    if (Object.keys(patch).length === 0) {
      return jsonError(400, 'No updatable fields provided');
    }

    const scope = await resolveAdminBranchScope(base44, auth.user.id);
    if (isScopeEmpty(scope)) {
      return jsonError(403, 'No branch is assigned to your admin account');
    }

    // ONLY a genuine record-not-found may become a 404. A rate limit or a database
    // failure is rethrown to the outer handler, which answers with the generic
    // failure — so a temporary outage never reads as "student does not exist".
    let student;
    try {
      student = await base44.asServiceRole.entities.Student.get(sid.value);
    } catch (e) {
      if (isNotFoundError(e)) return jsonError(404, 'Student not found');
      throw e;
    }
    if (!student || !student.id) return jsonError(404, 'Student not found');

    if (!isStudentInScope(scope, student)) {
      return jsonError(404, 'Student not found');
    }

    // Branches were already read by the scope resolver — no second identical query.
    const branch = (scope.branches || []).find((b) => b.id === student.home_branch_id);

    // ---- only genuinely different values reach the database ----
    const changes: Record<string, any> = {};
    if (patch.swimming_level !== undefined && patch.swimming_level !== (student.swimming_level || null)) {
      changes.swimming_level = patch.swimming_level;
    }
    if (
      patch.skill_progression !== undefined &&
      patch.skill_progression !== (student.skill_progression || null)
    ) {
      changes.skill_progression = patch.skill_progression;
    }

    const changedFields = Object.keys(changes);
    if (changedFields.length === 0) {
      // Nothing changed. No write and no audit entry claiming a change happened.
      return Response.json(
        { student: projectStudentDetail(student, branch ? branch.name : null), changed: [] },
        { status: 200 }
      );
    }

    const before: Record<string, any> = {};
    changedFields.forEach((field) => {
      before[field] = student[field] === undefined ? null : student[field] || null;
    });

    const updated = await base44.asServiceRole.entities.Student.update(student.id, changes);

    // AuditLog is append-only: actor, target, branch and before/after for exactly
    // the two authorized fields. The rest of the profile is never copied here.
    // serializeAuditDetails keeps `details` valid JSON at any length — never a raw
    // slice, which would cut the JSON mid-object.
    let auditRecorded = true;
    try {
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'student_progression_updated',
        actor_user_id: auth.user.id,
        actor_email: auth.user.email || null,
        target_type: 'student',
        target_id: student.id,
        branch_id: student.home_branch_id || null,
        summary: `Updated ${changedFields.join(' and ')} for ${student.full_name || 'swimmer'}`,
        details: serializeAuditDetails({ changed: changedFields, before, after: changes })
      });
    } catch (auditError) {
      // The profile change is already committed and is NOT rolled back — there is no
      // transaction to roll back with, and undoing a deliberate assessment would be
      // worse than a missing audit row. The gap is logged server-side and reported
      // honestly to the caller, so nobody believes the trail is complete when it is not.
      auditRecorded = false;
      console.error(
        '[updateStudentProgression] audit write failed',
        auditError && (auditError.message || auditError)
      );
    }

    return Response.json(
      {
        student: projectStudentDetail(updated, branch ? branch.name : null),
        changed: changedFields,
        audit_recorded: auditRecorded
      },
      { status: 200 }
    );
  } catch (error) {
    // Diagnostics stay server-side: the client never sees SDK or database details.
    console.error(
      '[updateStudentProgression] unexpected failure',
      error && (error.stack || error.message || error)
    );
    return serverFailure('updateStudentProgression');
  }
}