import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { serverFailure } from '../../shared/directoryAccess.ts';
import { asArrayFallback } from '../../shared/academyRoles.ts';

// Returns the CALLER's own active academy role names.
//
// Server-authoritative on purpose: it resolves UserRole + Role with the service
// role, so role recognition never depends on the client being able to read those
// entities, and it is identical after a page refresh or a fresh login. It takes
// NO input — a caller can only ever read their own roles, never anyone else's.
//
// This is a UI aid only. Every privileged write still re-checks academy-admin
// authority server-side in its own function; recognising a role here grants no
// data access by itself.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const assignments = asArrayFallback(
      await base44.asServiceRole.entities.UserRole.filter(
        { user_id: user.id, is_active: true },
        { limit: 100 }
      )
    );

    const roleIds = [...new Set(assignments.map((a) => a.role_id).filter(Boolean))];
    let names = [];
    if (roleIds.length) {
      const rolesPage = asArrayFallback(
        await base44.asServiceRole.entities.Role.filter({ id: { $in: roleIds } }, { limit: 100 })
      );
      names = rolesPage.map((r) => r.name).filter(Boolean);
    }

    return Response.json(
      {
        roles: [...new Set(names)],
        is_app_admin: user.role === 'admin'
      },
      { status: 200 }
    );
  } catch (error) {
    // Diagnostics stay server-side: the client never sees SDK or database details.
    console.error('[getMyAcademyRoles] unexpected failure', error && (error.stack || error.message || error));
    return serverFailure('getMyAcademyRoles');
  }
}