import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  authenticateCaller,
  authorizeAcademyAdmin,
  readObjectBody,
  rejectUnknownParams,
  parseLimit,
  parseSearch,
  parseStatus,
  parseCursor,
  parseBranchId,
  escapeRegex,
  toPage,
  projectDirectoryStudent,
  serverFailure,
  jsonError,
  DIRECTORY_ALLOWED_PARAMS
} from '../../shared/directoryAccess.ts';
import {
  resolveAdminBranchScope,
  listActiveBranches,
  isScopeEmpty,
  branchesInScope
} from '../../shared/adminScope.ts';

// Read-only academy-wide swimmer directory.
//
// Authorization runs BEFORE any elevated database access: an active Academy Admin
// assignment is resolved server-side from the verified session, so an ordinary
// Student, Parent, or Coach is refused here regardless of what the frontend shows
// or which ids/filters the browser supplies.
//
// Supported input (all optional): search, status, limit, cursor, branch_id.
// Anything else is rejected. Search matches full_name (case-insensitive, literal).
// Status uses the Student.status enum.
//
// BRANCH SCOPE: results are narrowed to the caller's Admin branch scope, resolved
// server-side from their own active AdminBranchAssignment rows.
//  - all-branches Admin: every student (so unassigned records stay findable)
//  - branch-scoped Admin: only students whose home_branch_id is in scope
//  - no active scope: 403, no data at all
// branch_id only NARROWS within that scope; a branch outside it is refused (403),
// so editing the request can never widen authorization.
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

    const unknown = rejectUnknownParams(body, DIRECTORY_ALLOWED_PARAMS);
    if (unknown.error) return unknown.error;

    const limit = parseLimit(body.limit);
    if (limit.error) return limit.error;
    const search = parseSearch(body.search);
    if (search.error) return search.error;
    const status = parseStatus(body.status);
    if (status.error) return status.error;
    const cursor = parseCursor(body.cursor);
    if (cursor.error) return cursor.error;
    const branchFilter = parseBranchId(body.branch_id);
    if (branchFilter.error) return branchFilter.error;

    // Scope comes from the caller's own records, never from the request.
    const scope = await resolveAdminBranchScope(base44, auth.user.id);
    if (isScopeEmpty(scope)) {
      return jsonError(403, 'No branch is assigned to your administrator account');
    }
    if (branchFilter.value && !scope.branchIds.includes(branchFilter.value)) {
      return jsonError(403, 'That branch is not in your administrator scope');
    }

    // Filters are built only from validated values — never from raw input.
    const query = {};
    if (search.value) {
      query.full_name = { $regex: escapeRegex(search.value), $options: 'i' };
    }
    if (status.value) query.status = status.value;
    if (branchFilter.value) {
      query.home_branch_id = branchFilter.value;
    } else if (!scope.allBranches) {
      // A student with no home branch is excluded here rather than exposed: a
      // missing assignment needs correcting, it must not widen access.
      query.home_branch_id = { $in: scope.branchIds };
    }

    const options = { limit: limit.value, sort: 'full_name' };
    if (cursor.value) options.cursor = cursor.value;

    // Elevated access happens only after the caller passed the gate above.
    let page;
    try {
      page = toPage(await base44.asServiceRole.entities.Student.filter(query, options));
    } catch (e) {
      // A tampered/garbage cursor is a bad request, not a server fault — and it
      // must never widen the query or silently fall back to page one.
      if (cursor.value) return jsonError(400, 'Invalid pagination cursor');
      throw e;
    }

    const activeBranches = await listActiveBranches(base44);
    const namesById = {};
    activeBranches.forEach((b) => {
      namesById[b.id] = b.name;
    });

    return Response.json(
      {
        students: page.items.map((s) => projectDirectoryStudent(s, namesById[s.home_branch_id] || null)),
        has_more: page.has_more,
        next_cursor: page.next_cursor,
        limit: limit.value,
        applied: { search: search.value, status: status.value, branch_id: branchFilter.value },
        // Lets the screen offer the branch filter from authorized values only.
        scope: { all_branches: scope.allBranches, branch_ids: scope.branchIds },
        branches: branchesInScope(scope, activeBranches).map((b) => ({
          id: b.id,
          name: b.name,
          code: b.code || null
        }))
      },
      { status: 200 }
    );
  } catch (error) {
    // Diagnostics stay in the function logs; the client never sees internals.
    console.error('[listStudents] unexpected failure', error && (error.stack || error.message || error));
    return serverFailure('listStudents');
  }
}