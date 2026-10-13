import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  findRoleByName,
  getActiveAcademyAdminAssignment,
  publicAssignment,
  asArrayFallback
} from '../../shared/academyRoles.ts';

// List academy role assignments for admin UI. Academy-admin gated.
// Returns minimum necessary info, bounded to 100 records.
// Optional filter: target_user_id (returns that user's assignments only).

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

    // Optional target_user_id from query/body. We accept a simple query param or JSON body.
    let targetUserId = null;
    const url = new URL(req.url);
    const q = url.searchParams.get('target_user_id');
    if (q) targetUserId = q.trim();
    else {
      try {
        const body = await req.json();
        if (body && typeof body.target_user_id === 'string' && body.target_user_id.trim()) {
          targetUserId = body.target_user_id.trim();
        }
      } catch {
        // no body is fine
      }
    }

    // Load bounded set of UserRole records (active and inactive, for history).
    // Bound to 100 to cap cost/exposure.
    const query = {};
    if (targetUserId) query.user_id = targetUserId;
    const page = await base44.asServiceRole.entities.UserRole.filter(query, { sort: '-assigned_date', limit: 100 });
    const assignments = asArrayFallback(page);

    // Resolve all role names in one pass to avoid per-record lookups.
    const roleIds = [...new Set(assignments.map(a => a.role_id).filter(Boolean))];
    const roleMap = {};
    if (roleIds.length) {
      const rolesPage = await base44.asServiceRole.entities.Role.filter({ id: { $in: roleIds } }, { limit: 100 });
      for (const r of asArrayFallback(rolesPage)) roleMap[r.id] = r;
    }

    const out = assignments.map(a => publicAssignment(a, roleMap[a.role_id]));
    return Response.json({ assignments: out, count: out.length, truncated: assignments.length === 100 }, { status: 200 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}