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
  escapeRegex,
  toPage,
  projectDirectoryStudent,
  serverFailure,
  jsonError,
  DIRECTORY_ALLOWED_PARAMS
} from '../../shared/directoryAccess.ts';

// Read-only academy-wide swimmer directory.
//
// Authorization runs BEFORE any elevated database access: an active Academy Admin
// assignment is resolved server-side from the verified session, so an ordinary
// Student, Parent, or Coach is refused here regardless of what the frontend shows
// or which ids/filters the browser supplies.
//
// Supported input (all optional): search, status, limit, cursor. Anything else is
// rejected. Search matches full_name (case-insensitive, literal). Status uses the
// Student.status enum. There is no branch filter: Student has no branch/location
// field, so branch scoping cannot be honoured and must not be faked.
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

    // Filters are built only from validated values — never from raw input.
    const query = {};
    if (search.value) {
      query.full_name = { $regex: escapeRegex(search.value), $options: 'i' };
    }
    if (status.value) query.status = status.value;

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

    return Response.json(
      {
        students: page.items.map(projectDirectoryStudent),
        has_more: page.has_more,
        next_cursor: page.next_cursor,
        limit: limit.value,
        applied: { search: search.value, status: status.value }
      },
      { status: 200 }
    );
  } catch {
    return serverFailure('listStudents');
  }
}