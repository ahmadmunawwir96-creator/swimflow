import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { serverFailure } from '../../shared/directoryAccess.ts';
import {
  validateProfileInput,
  rejectFields,
  consentForSelf,
  todayISODate,
  asArray,
  DEPENDENT_RELATIONSHIPS,
  SERVER_CONTROLLED_FIELDS
} from '../../shared/studentProfile.ts';
import {
  findRoleByName,
  getActiveAssignment,
  requireString
} from '../../shared/academyRoles.ts';

// Self-service registration: creates the academy role + swimmer profile for a
// newly-registered user based on their account-type choice. Runs as the
// authenticated registrant; writes via service role.
//   independent     -> 'student' role + self-managed swimmer profile
//   parent_guardian -> 'parent' role + first child's dependent profile
//                     (parent contact stored as the child's emergency contact)
// Idempotent: skips role if already active; reuses a matching profile if present.
// Note: this is the ONE deliberate self-service role assignment path; all other
// role grants remain academy-admin-gated via assignAcademyRole.

const ACCOUNT_TYPES = ['independent', 'parent_guardian'];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

    let input;
    try { input = await req.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Reject server-controlled fields; caller must never set ownership/consent/status.
    const rej = rejectFields(input, SERVER_CONTROLLED_FIELDS);
    if (rej) return rej;

    const at = requireString(input.account_type, 'account_type');
    if (at.error) return at.error;
    if (!ACCOUNT_TYPES.includes(at.value)) {
      return Response.json({ error: "account_type must be 'independent' or 'parent_guardian'" }, { status: 400 });
    }

    const isParent = at.value === 'parent_guardian';
    const roleName = isParent ? 'parent' : 'student';

    // Validate swimmer (child for parent) fields.
    const v = validateProfileInput(input, { requireName: true, requireDob: true });
    if (v.error) return v.error;
    const values = v.values;

    // Parent path requires parent contact + relationship.
    let parentName = null;
    let parentPhone = null;
    if (isParent) {
      const pn = requireString(input.parent_name, 'parent_name');
      if (pn.error) return pn.error;
      const pp = requireString(input.parent_phone, 'parent_phone');
      if (pp.error) return pp.error;
      parentName = pn.value;
      parentPhone = pp.value;
      if (input.relationship === undefined) {
        return Response.json({ error: 'relationship is required for a dependent profile' }, { status: 400 });
      }
      if (!DEPENDENT_RELATIONSHIPS.includes(input.relationship)) {
        return Response.json({ error: 'relationship must be one of child, dependant, ward, sibling' }, { status: 400 });
      }
    }

    // Optional guardian info for self-managed minors.
    if (!isParent) {
      if (input.consent_guardian_name !== undefined) {
        if (typeof input.consent_guardian_name !== 'string') return Response.json({ error: 'consent_guardian_name must be a string' }, { status: 400 });
        values.consent_guardian_name = input.consent_guardian_name.trim();
      }
      if (input.consent_guardian_phone !== undefined) {
        if (typeof input.consent_guardian_phone !== 'string') return Response.json({ error: 'consent_guardian_phone must be a string' }, { status: 400 });
        values.consent_guardian_phone = input.consent_guardian_phone.trim();
      }
    }

    // Resolve role record.
    const roleRes = await findRoleByName(base44, roleName);
    if (roleRes.error) return roleRes.error;

    // Create role assignment if not already active (idempotent).
    let assignment = await getActiveAssignment(base44, user.id, roleRes.role.id);
    if (!assignment) {
      assignment = await base44.asServiceRole.entities.UserRole.create({
        user_id: user.id,
        role_id: roleRes.role.id,
        assigned_by: user.id,
        assigned_date: new Date().toISOString(),
        is_active: true
      });
    }

    // Create student profile (idempotent via duplicate guard).
    values.account_id = user.id;
    values.status = 'active';
    values.date_joined = todayISODate();

    let student;
    if (isParent) {
      const dupPage = await base44.asServiceRole.entities.Student.filter(
        { account_id: user.id, full_name: values.full_name, date_of_birth: values.date_of_birth },
        { limit: 1 }
      );
      const existing = asArray(dupPage)[0];
      if (existing) {
        student = existing;
      } else {
        values.ownership_type = 'dependent';
        values.relationship = input.relationship;
        values.consent_status = 'not_required';
        values.emergency_contact_name = parentName;
        values.emergency_contact_phone = parentPhone;
        student = await base44.asServiceRole.entities.Student.create(values);
      }
    } else {
      const dupPage = await base44.asServiceRole.entities.Student.filter(
        { account_id: user.id, ownership_type: 'self' },
        { limit: 1 }
      );
      const existing = asArray(dupPage)[0];
      if (existing) {
        student = existing;
      } else {
        const consent = consentForSelf(values.date_of_birth);
        if (!consent) return Response.json({ error: 'Could not determine age from date_of_birth' }, { status: 400 });
        values.consent_status = consent.consent_status;
        if (consent.consent_status === 'pending' && (values.consent_guardian_name || values.consent_guardian_phone)) {
          values.consent_date = todayISODate();
        }
        values.ownership_type = 'self';
        values.relationship = 'self';
        student = await base44.asServiceRole.entities.Student.create(values);
      }
    }

    // Record the user's display name on their account so the app greets people
    // by name (dashboard greeting, header, admin role table) rather than email.
    // The built-in full_name is read-only, so we use the custom display_name field.
    const displayName = isParent ? parentName : values.full_name;
    if (displayName) {
      try {
        await base44.asServiceRole.entities.User.update(user.id, { display_name: displayName });
      } catch {
        // Non-fatal: role/profile still created; UI falls back to full_name/email.
      }
    }

    return Response.json(
      { role: roleName, assignment: { id: assignment.id, role_name: roleName, is_active: true }, student },
      { status: 201 }
    );
  } catch (error) {
    // Diagnostics stay server-side: the client never sees SDK or database details.
    console.error('[registerAccount] unexpected failure', error && (error.stack || error.message || error));
    return serverFailure('registerAccount');
  }
}