import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  authenticateCaller,
  readObjectBody,
  rejectUnknownParams,
  jsonError,
  serverFailure
} from '../../shared/directoryAccess.ts';
import { asArray } from '../../shared/studentProfile.ts';
import { resolveUserMap } from '../../shared/academyRoles.ts';
import {
  requireDate,
  todayInAcademyZone,
  addDays,
  daysBetween,
  requireLevel,
  optionalId,
  minutesOf,
  projectMemberClass,
  buildClassContext,
  displayName,
  LEVELS,
  LEVEL_LABELS,
  MEMBER_MAX_WINDOW_DAYS
} from '../../shared/classAccess.ts';

// Read-only timetable for swimmers and parents. VIEW ONLY — nothing here books,
// holds or deducts anything.
//
// Any signed-in member may read it: it contains no per-person data, no internal
// ids and nothing about authorization. A parent additionally gets their own
// swimmers so the screen can suggest a level; that list is filtered by the
// caller's own account id on the server, never by an id taken from the browser.
//
// Cancelled sessions are excluded (there is nothing to attend), and cross-branch
// classes are included on purpose: a swimmer's home branch is management
// ownership, not a restriction on where they may swim.
//
// Supported input: { from?, days?, level?, swimmer_id? }.
const ALLOWED_PARAMS = ['from', 'days', 'level', 'swimmer_id'];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    const auth = await authenticateCaller(base44);
    if (auth.error) return auth.error;

    const bodyRes = await readObjectBody(req);
    if (bodyRes.error) return bodyRes.error;
    const body = bodyRes.body;

    const unknown = rejectUnknownParams(body, ALLOWED_PARAMS);
    if (unknown.error) return unknown.error;

    const today = todayInAcademyZone();
    const from = body.from ? requireDate(body.from, 'from') : { value: today };
    if (from.error) return from.error;

    let days = 7;
    if (body.days !== undefined && body.days !== null && body.days !== '') {
      const numeric = Number(body.days);
      if (!Number.isInteger(numeric) || numeric < 1 || numeric > MEMBER_MAX_WINDOW_DAYS) {
        return jsonError(400, `days must be a whole number between 1 and ${MEMBER_MAX_WINDOW_DAYS}`);
      }
      days = numeric;
    }
    const to = addDays(from.value, days - 1);

    const level = body.level ? requireLevel(body.level) : { value: null };
    if (level.error) return level.error;

    const swimmerId = optionalId(body.swimmer_id, 'swimmer_id');
    if (swimmerId.error) return swimmerId.error;

    // The caller's own swimmers only — account_id comes from the verified session.
    const students = asArray(
      await base44.asServiceRole.entities.Student.filter(
        { account_id: auth.user.id },
        { limit: 50 }
      )
    );
    const activeStudents = students
      .filter((student) => student && student.id && student.status !== 'left')
      .map((student) => ({
        id: student.id,
        full_name: student.full_name || null,
        swimming_level: student.swimming_level || null
      }));

    let viewer = null;
    if (swimmerId.value) {
      const match = activeStudents.find((student) => student.id === swimmerId.value);
      if (!match) return jsonError(403, 'That swimmer is not on your account.');
      viewer = match;
    }

    const query = {
      class_date: { $gte: from.value, $lte: to.value },
      status: 'scheduled'
    };
    if (level.value) query.skill_level = level.value;

    const page = asArray(
      await base44.asServiceRole.entities.Class.filter(query, { limit: 200, sort: 'class_date' })
    );

    const rows = page
      .filter((row) => row && row.id && row.class_date)
      .sort((a, b) =>
        a.class_date === b.class_date
          ? (minutesOf(a.start_time) || 0) - (minutesOf(b.start_time) || 0)
          : String(a.class_date) < String(b.class_date)
            ? -1
            : 1
      );

    const locationIds = [...new Set(rows.map((row) => row.location_id).filter(Boolean))];
    const coachIds = [...new Set(rows.map((row) => row.coach_id).filter(Boolean))];

    const locationNames = {};
    if (locationIds.length) {
      const venues = asArray(
        await base44.asServiceRole.entities.Location.filter({ id: { $in: locationIds } }, { limit: 200 })
      );
      venues.forEach((venue) => {
        locationNames[venue.id] = venue.name || null;
      });
    }

    const branchNames = {};
    const branches = asArray(await base44.asServiceRole.entities.Branch.list('-created_date', 200));
    branches.forEach((branch) => {
      branchNames[branch.id] = branch.name || null;
    });

    const coachNames = {};
    if (coachIds.length) {
      const users = await resolveUserMap(base44, coachIds);
      coachIds.forEach((id) => {
        const name = displayName(users[id]);
        if (name) coachNames[id] = name;
      });
    }

    const ctx = buildClassContext({ locationNames, branchNames, coachNames, today });

    return Response.json(
      {
        classes: rows.map((row) => projectMemberClass(row, ctx)),
        window: { from: from.value, to, days },
        today,
        level: level.value,
        viewer,
        swimmers: activeStudents,
        levels: LEVELS.map((value) => ({ value, label: LEVEL_LABELS[value] }))
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[listMemberClasses] unexpected failure', error && (error.stack || error.message || error));
    return serverFailure('listMemberClasses');
  }
}