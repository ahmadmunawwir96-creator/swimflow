// Classification of Base44 SDK failures, shared by every server-side helper.
//
// Leaf module: it imports nothing. That matters because the modules that need this
// predicate already depend on each other in one direction (directoryAccess and
// classAccess import academyRoles), so a classifier living in any of them would be
// circular for the others. Keeping it here lets academyRoles, directoryAccess and
// classAccess share ONE definition instead of drifting copies.

// True ONLY when the SDK reported that the record does not exist.
//
// This is deliberately strict. Treating every thrown error as "not found" turns a
// rate limit, a database outage or an SDK failure into "this record does not exist"
// — the screen then tells staff the person is gone when the real problem is
// temporary. Any error that is not a genuine 404 must reach the caller's generic
// server-failure handler instead.
export function isNotFoundError(e) {
  if (!e) return false;
  const status = e.status || e.statusCode || (e.response && e.response.status);
  if (status === 404) return true;
  const code = typeof e.code === 'string' ? e.code.toLowerCase() : '';
  return code === 'not_found' || code === 'notfound';
}