import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  findUserById,
  isPlatformAdmin,
  getActiveRoleAssignment,
  requireString
} from '../../shared/academyRoles.ts';

// Grant the BUILT-IN app admin role (User.role === 'admin') to a member.
// This is the platform app role, NOT the academy-admin UserRole.
//
// Gates (server-side; the UI is never the boundary):
//  - Caller must hold PLATFORM owner authority (User.role === 'admin'). A Swimflow
//    academy Admin must never be able to grant platform authority: platform access
//    is infrastructure/recovery, not a business capability.
//  - Only a member holding an active Student or Parent role may be promoted.
//  - No self-promotion, and no duplicate promotion.
//
// The grant is additive: academy role assignments are left untouched, so the
// member keeps their student/parent profile. Only an app editor or Base44 staff
// can take the app admin role away again (dashboard > App Users).
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

    const tid = requireString(input.target_user_id, 'target_user_id');
    if (tid.error) return tid.error;

    if (!isPlatformAdmin(user)) {
      return Response.json({ error: 'System-owner authority required' }, { status: 403 });
    }

    const { user: target, error: notFound } = await findUserById(base44, tid.value);
    if (notFound) return notFound;

    if (target.id === user.id) {
      return Response.json({ error: 'You cannot promote yourself' }, { status: 400 });
    }
    if (target.role === 'admin') {
      return Response.json({ error: 'This member is already an app Admin' }, { status: 409 });
    }

    const asStudent = await getActiveRoleAssignment(base44, target.id, 'student');
    const asParent = await getActiveRoleAssignment(base44, target.id, 'parent');
    if (!asStudent && !asParent) {
      return Response.json(
        { error: 'Only a member with an active Student or Parent role can be promoted to Admin' },
        { status: 400 }
      );
    }

    const updated = await base44.asServiceRole.entities.User.update(target.id, { role: 'admin' });

    return Response.json(
      {
        user: {
          user_id: updated.id,
          email: updated.email,
          full_name: updated.full_name || null,
          role: updated.role
        }
      },
      { status: 200 }
    );
  } catch (error) {
    // Diagnostics stay in the function logs; the client never sees internals.
    console.error('[grantAppAdmin] unexpected failure', error);
    return Response.json({ error: 'Grant could not be completed' }, { status: 500 });
  }
}