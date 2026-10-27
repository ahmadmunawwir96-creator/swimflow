import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  authenticateCaller,
  authorizeAcademyAdmin,
  readObjectBody,
  rejectUnknownParams,
  jsonError,
  serverFailure,
  isNotFoundError,
  projectStudentDetail
} from '../../shared/directoryAccess.ts';
import { resolveAdminBranchScope, isStudentInScope, isScopeEmpty } from '../../shared/adminScope.ts';
import { requireString } from '../../shared/academyRoles.ts';

// Admin-facing profile of ONE student.
//
// Authorization is performed independently of listStudents: appearing in a listing
// (or knowing an id) proves nothing. The order is fixed:
//   1. authenticate the caller
//   2. confirm an active Swimflow Admin role
//   3. resolve the Admin's branch scope server-side
//   4. load the requested student (service role, only after 1-3)
//   5. read the student's home branch
//   6. confirm that branch is inside the scope
//   7. return the approved projection
//
// A student outside scope returns 404 — the same answer as a student that does not
// exist — so the endpoint cannot be used to probe other branches for ids.
//
// Supported input: { student_id } only.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    const auth = await authenticateCaller(base44);
    if (auth.error) return auth.error;

    const gate = await authorizeAcademyAdmin(base44, auth.user);
    if (gate.error) return gate.error;

    const bodyRes = await readObjectBody(req);
    if (bodyRes.error) return bodyRes.error;

    const unknown = rejectUnknownParams(bodyRes.body, ['student_id']);
    if (unknown.error) return unknown.error;

    const sid = requireString(bodyRes.body.student_id, 'student_id');
    if (sid.error) return sid.error;

    const scope = await resolveAdminBranchScope(base44, auth.user.id);
    if (isScopeEmpty(scope)) {
      return jsonError(403, 'No branch is assigned to your admin account');
    }

    // ONLY a genuine record-not-found may become a 404. A rate limit, a database or
    // SDK failure is rethrown to the outer handler, which answers with the generic
    // server failure — so a temporary outage never reads as "student does not exist".
    let student;
    try {
      student = await base44.asServiceRole.entities.Student.get(sid.value);
    } catch (e) {
      if (isNotFoundError(e)) return jsonError(404, 'Student not found');
      throw e;
    }
    if (!student || !student.id) return jsonError(404, 'Student not found');

    if (!isStudentInScope(scope, student)) {
      return jsonError(404, 'Student not found');
    }

    // Branches were already read by the scope resolver — no second identical query.
    const branch = (scope.branches || []).find((b) => b.id === student.home_branch_id);

    return Response.json(
      {
        student: projectStudentDetail(student, branch ? branch.name : null),
        scope: { all_branches: scope.allBranches, branch_ids: scope.branchIds }
      },
      { status: 200 }
    );
  } catch {
    return serverFailure('getStudent');
  }
}