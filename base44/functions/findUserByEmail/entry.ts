import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  findUserByEmail as findUser,
  getActiveAcademyAdminAssignment,
  requireEmail,
  publicUser
} from '../../shared/academyRoles.ts';

// Look up a user by email for the admin role-assignment UI.
// Academy-admin gated. Returns only { user_id, email, full_name }.
// Uses a narrow email filter — never enumerates users.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

    // Academy-admin gate.
    const callerAdmin = await getActiveAcademyAdminAssignment(base44, user.id);
    if (!callerAdmin) {
      return Response.json({ error: 'Academy administrator authority required' }, { status: 403 });
    }

    let input;
    try {
      input = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const email = requireEmail(input.email);
    if (email.error) return email.error;

    const { user: target, error: notFound } = await findUser(base44, email.value);
    if (notFound) return notFound;

    return Response.json({ user: publicUser(target) }, { status: 200 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}