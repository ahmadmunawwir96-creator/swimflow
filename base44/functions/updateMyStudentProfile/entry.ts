import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  validateProfileInput,
  rejectFields,
  consentForSelf,
  asArray,
  SERVER_CONTROLLED_FIELDS
} from '../../shared/studentProfile.ts';
import { serverFailure } from '../../shared/directoryAccess.ts';
import { isNotFoundError } from '../../shared/sdkErrors.ts';

// Guardian fields and relationship are also protected on update (consent history must not be rewritten here).
const UPDATE_PROTECTED = [...SERVER_CONTROLLED_FIELDS, 'relationship', 'consent_guardian_name', 'consent_guardian_phone'];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

    let input;
    try {
      input = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }
    if (!input.student_id || typeof input.student_id !== 'string') {
      return Response.json({ error: 'student_id is required' }, { status: 400 });
    }

    // Reject the entire request if any protected field is present.
    const rej = rejectFields(input, UPDATE_PROTECTED);
    if (rej) return rej;

    // Service role bypasses RLS, so we verify ownership explicitly after loading.
    // A malformed/missing id yields a clean 404 — but ONLY a genuine 404 does.
    let student;
    try {
      const studentPage = await base44.asServiceRole.entities.Student.filter(
        { id: input.student_id },
        { limit: 1 }
      );
      const students = asArray(studentPage);
      if (students.length === 0) {
        return Response.json({ error: 'Student profile not found' }, { status: 404 });
      }
      student = students[0];
    } catch (error) {
      // Only a GENUINE "no such profile" is a 404. A rate limit, a database outage or
      // any other SDK failure is rethrown to the handler's existing generic 500 — told
      // to the member as "profile not found" it would be a lie, and they would be sent
      // looking for a profile that still exists. Diagnostics stay server-side.
      if (!isNotFoundError(error)) throw error;
      return Response.json({ error: 'Student profile not found' }, { status: 404 });
    }

    if (student.account_id !== user.id) {
      return Response.json(
        { error: 'You do not have permission to update this profile' },
        { status: 403 }
      );
    }

    // Only the mutable allowlist is accepted.
    const v = validateProfileInput(input, { requireName: false, requireDob: false });
    if (v.error) return v.error;
    const updates = v.values;

    // Re-evaluate age-based consent when date_of_birth changes. Never auto-grant.
    let consentReviewRecommended = false;
    if (updates.date_of_birth !== undefined && updates.date_of_birth !== student.date_of_birth) {
      const reeval = consentForSelf(updates.date_of_birth, student.consent_status);
      if (!reeval) {
        return Response.json({ error: 'Could not determine age from date_of_birth' }, { status: 400 });
      }
      updates.consent_status = reeval.consent_status;
      consentReviewRecommended = reeval.needs_review;
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'No updatable fields provided' }, { status: 400 });
    }

    const updated = await base44.asServiceRole.entities.Student.update(student.id, updates);
    const result: Record<string, any> = { student: updated };
    if (consentReviewRecommended) result.consent_review_recommended = true;
    return Response.json(result, { status: 200 });
  } catch (error) {
    // Diagnostics stay server-side: the client never sees SDK or database details.
    console.error('[updateMyStudentProfile] unexpected failure', error && (error.stack || error.message || error));
    return serverFailure('updateMyStudentProfile');
  }
}