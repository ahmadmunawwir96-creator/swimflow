import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  validateProfileInput,
  rejectFields,
  consentForSelf,
  todayISODate,
  asArray,
  SERVER_CONTROLLED_FIELDS
} from '../../shared/studentProfile.ts';

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

    // Reject server-controlled fields; the caller must never set ownership/consent/status.
    // 'relationship' is also rejected here — the server forces 'self'.
    const rej = rejectFields(input, [...SERVER_CONTROLLED_FIELDS, 'relationship']);
    if (rej) return rej;

    const v = validateProfileInput(input, { requireName: true, requireDob: true });
    if (v.error) return v.error;
    const values = v.values;

    // Optional guardian info for self-managed minors (not auto-granted, just recorded).
    if (input.consent_guardian_name !== undefined) {
      if (typeof input.consent_guardian_name !== 'string') {
        return Response.json({ error: 'consent_guardian_name must be a string' }, { status: 400 });
      }
      values.consent_guardian_name = input.consent_guardian_name.trim();
    }
    if (input.consent_guardian_phone !== undefined) {
      if (typeof input.consent_guardian_phone !== 'string') {
        return Response.json({ error: 'consent_guardian_phone must be a string' }, { status: 400 });
      }
      values.consent_guardian_phone = input.consent_guardian_phone.trim();
    }

    // Duplicate self-profile guard: one self-managed profile per account.
    const dupPage = await base44.asServiceRole.entities.Student.filter(
      { account_id: user.id, ownership_type: 'self' },
      { limit: 1 }
    );
    if (asArray(dupPage).length > 0) {
      return Response.json(
        { error: 'This account already has a self-managed swimmer profile' },
        { status: 409 }
      );
    }

    // Consent based on age. Never 'given'.
    const consent = consentForSelf(values.date_of_birth);
    if (!consent) {
      return Response.json({ error: 'Could not determine age from date_of_birth' }, { status: 400 });
    }
    values.consent_status = consent.consent_status;
    if (consent.consent_status === 'pending' && (values.consent_guardian_name || values.consent_guardian_phone)) {
      values.consent_date = todayISODate();
    }

    // Server-derived ownership — never from client input.
    values.account_id = user.id;
    values.ownership_type = 'self';
    values.relationship = 'self';
    values.status = 'active';
    values.date_joined = todayISODate();

    const created = await base44.asServiceRole.entities.Student.create(values);
    return Response.json({ student: created }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}