import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { serverFailure } from '../../shared/directoryAccess.ts';
import {
  validateProfileInput,
  rejectFields,
  todayISODate,
  asArray,
  DEPENDENT_RELATIONSHIPS,
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

    // Reject server-controlled fields AND guardian fields (the parent is the consenting party).
    const rej = rejectFields(input, [...SERVER_CONTROLLED_FIELDS, 'consent_guardian_name', 'consent_guardian_phone']);
    if (rej) return rej;

    // relationship is required for a dependent and must not be 'self'.
    if (input.relationship === undefined) {
      return Response.json({ error: 'relationship is required for a dependent profile' }, { status: 400 });
    }
    if (!DEPENDENT_RELATIONSHIPS.includes(input.relationship)) {
      return Response.json(
        { error: 'relationship must be one of child, dependant, ward, sibling' },
        { status: 400 }
      );
    }

    const v = validateProfileInput(input, { requireName: true, requireDob: true });
    if (v.error) return v.error;
    const values = v.values;

    // Verify an active academy 'parent' role via UserRole -> Role. Never trust a client claim.
    const rolePage = await base44.asServiceRole.entities.Role.filter({ name: 'parent' }, { limit: 1 });
    const roles = asArray(rolePage);
    if (!roles.length) {
      return Response.json({ error: 'Parent role is not configured in the academy' }, { status: 500 });
    }
    const parentRoleId = roles[0].id;

    const urPage = await base44.asServiceRole.entities.UserRole.filter(
      { user_id: user.id, role_id: parentRoleId, is_active: true },
      { limit: 1 }
    );
    if (asArray(urPage).length === 0) {
      return Response.json(
        { error: 'A verified parent academy role is required to create a dependent profile' },
        { status: 403 }
      );
    }

    // Likely-duplicate dependent: same name + DOB under the same account.
    const dupPage = await base44.asServiceRole.entities.Student.filter(
      { account_id: user.id, full_name: values.full_name, date_of_birth: values.date_of_birth },
      { limit: 1 }
    );
    if (asArray(dupPage).length > 0) {
      return Response.json(
        {
          error:
            'A dependent with this name and date of birth already exists under your account. Contact an administrator if this is a legitimate exception.'
        },
        { status: 409 }
      );
    }

    // Server-derived ownership — never from client input.
    values.account_id = user.id;
    values.ownership_type = 'dependent';
    values.relationship = input.relationship;
    values.consent_status = 'not_required';
    values.status = 'active';
    values.date_joined = todayISODate();

    const created = await base44.asServiceRole.entities.Student.create(values);
    return Response.json({ student: created }, { status: 201 });
  } catch (error) {
    // Diagnostics stay server-side: the client never sees SDK or database details.
    console.error('[createDependentStudentProfile] unexpected failure', error && (error.stack || error.message || error));
    return serverFailure('createDependentStudentProfile');
  }
}