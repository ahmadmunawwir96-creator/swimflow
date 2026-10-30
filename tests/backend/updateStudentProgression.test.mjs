import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, invoke, captureErrors, IDS, GENERIC_FAILURE } from '../harness/world.mjs';

const FN = 'updateStudentProgression';
const base = () => ({ student_id: IDS.student, swimming_level: 'intermediate' });

function asUser(id, role = 'user') {
  return { id, email: `${id}@academy.test`, role };
}

function grantRole(world, userId, roleId, isActive = true) {
  world.store.UserRole.push({
    id: `ur_${userId}_${roleId}`,
    user_id: userId,
    role_id: roleId,
    is_active: isActive
  });
}

// ---------------------------------------------------------------- authentication

test('updateStudentProgression: no session is 401 and nothing is written', async () => {
  for (const authMode of ['null', 'throw']) {
    const world = makeWorld({ authMode });
    const res = await invoke(FN, world, base());
    assert.equal(res.status, 401, `authMode=${authMode}`);
    assert.equal(world.writes().length, 0);
  }
});

// ----------------------------------------------------------------- authorization

test('updateStudentProgression: coach, parent, student and inactive admin are all 403 before any student read', async () => {
  const cases = [
    { label: 'coach', userId: IDS.coachUser, grant: IDS.coachRole },
    { label: 'parent', userId: IDS.parentUser, grant: null }, // parent role seeded by default
    { label: 'student', userId: IDS.memberUser, grant: IDS.studentRole }
  ];

  for (const c of cases) {
    const world = makeWorld({ user: asUser(c.userId) });
    if (c.grant) grantRole(world, c.userId, c.grant);
    const res = await invoke(FN, world, base());
    assert.equal(res.status, 403, `${c.label} must be refused`);
    assert.equal(world.writes().length, 0, `${c.label} caused a write`);
    assert.equal(
      world.calls.some((call) => call.entity === 'Student'),
      false,
      `${c.label} reached the student record before the role gate`
    );
  }
});

test('updateStudentProgression: an INACTIVE academy admin assignment is 403', async () => {
  const world = makeWorld();
  world.store.UserRole = world.store.UserRole.map((r) =>
    r.user_id === IDS.adminUser ? { ...r, is_active: false } : r
  );
  const res = await invoke(FN, world, base());
  assert.equal(res.status, 403);
  assert.equal(world.writes().length, 0);
});

test('updateStudentProgression: a platform admin with no academy role is 403, not allowed', async () => {
  const world = makeWorld({ user: asUser(IDS.platformAdmin, 'admin') });
  world.store.UserRole = []; // no academy assignment at all
  const res = await invoke(FN, world, base());
  assert.equal(res.status, 403);
  assert.equal(world.writes().length, 0);
  assert.equal(world.calls.some((call) => call.entity === 'Student'), false);
});

test('updateStudentProgression: an admin with no branch scope is 403', async () => {
  const world = makeWorld();
  world.store.AdminBranchAssignment = [];
  const res = await invoke(FN, world, base());
  assert.equal(res.status, 403);
  assert.equal(world.writes().length, 0);
});

test('updateStudentProgression: student outside the branch scope is 404 with no write', async () => {
  const world = makeWorld();
  world.store.AdminBranchAssignment = [
    { id: 'aba_1', user_id: IDS.adminUser, all_branches: false, branch_id: IDS.branch1, is_active: true }
  ];
  world.store.Student[0].home_branch_id = IDS.branch2;

  const res = await invoke(FN, world, base());
  assert.equal(res.status, 404);
  assert.equal(world.writes().length, 0);
  assert.equal(world.store.Student[0].swimming_level, 'beginner');
});

test('updateStudentProgression: a student with no home branch fails closed for a scoped admin', async () => {
  const world = makeWorld();
  world.store.AdminBranchAssignment = [
    { id: 'aba_1', user_id: IDS.adminUser, all_branches: false, branch_id: IDS.branch1, is_active: true }
  ];
  world.store.Student[0].home_branch_id = undefined;
  const res = await invoke(FN, world, base());
  assert.equal(res.status, 404);
  assert.equal(world.writes().length, 0);
});

test('updateStudentProgression: a missing student is 404', async () => {
  const world = makeWorld();
  const res = await invoke(FN, world, { student_id: 'stu_does_not_exist', swimming_level: 'advanced' });
  assert.equal(res.status, 404);
  assert.equal(world.writes().length, 0);
});

// ------------------------------------------------------------ payload validation

test('updateStudentProgression: payload validation happens before the student is read', async () => {
  const world = makeWorld();
  const res = await invoke(FN, world, { student_id: IDS.student, swimming_level: 'expert' });
  assert.equal(res.status, 400);
  assert.equal(world.calls.some((call) => call.entity === 'Student'), false);
  assert.equal(world.writes().length, 0);
});

test('updateStudentProgression: allowlist, enum and note rules', async () => {
  const cases = [
    { label: 'unknown param', body: { student_id: IDS.student, swimming_level: 'advanced', account_id: 'u_parent' }, match: 400 },
    { label: 'no updatable fields', body: { student_id: IDS.student }, match: 400 },
    { label: 'missing student_id', body: { swimming_level: 'advanced' }, match: 400 },
    { label: 'invalid enum', body: { student_id: IDS.student, swimming_level: 'expert' }, match: 400 },
    { label: 'null level', body: { student_id: IDS.student, swimming_level: null }, match: 400 },
    { label: 'empty level', body: { student_id: IDS.student, swimming_level: '' }, match: 400 },
    { label: 'numeric level', body: { student_id: IDS.student, swimming_level: 2 }, match: 400 },
    { label: 'null notes', body: { student_id: IDS.student, skill_progression: null }, match: 400 },
    { label: 'numeric notes', body: { student_id: IDS.student, skill_progression: 42 }, match: 400 },
    { label: 'object notes', body: { student_id: IDS.student, skill_progression: { a: 1 } }, match: 400 },
    { label: 'oversize notes', body: { student_id: IDS.student, skill_progression: 'x'.repeat(501) }, match: 400 }
  ];

  for (const c of cases) {
    const world = makeWorld();
    const before = world.snapshot();
    const res = await invoke(FN, world, c.body);
    assert.equal(res.status, c.match, `${c.label}: ${JSON.stringify(res.body)}`);
    assert.equal(world.writes().length, 0, `${c.label} wrote something`);
    assert.deepEqual(world.snapshot(), before, `${c.label} changed stored data`);
  }
});

test('updateStudentProgression: 500 characters of notes is accepted (boundary)', async () => {
  const world = makeWorld();
  const notes = 'y'.repeat(500);
  const res = await invoke(FN, world, { student_id: IDS.student, skill_progression: notes });
  assert.equal(res.status, 200);
  assert.equal(world.store.Student[0].skill_progression, notes);
  const log = world.rows('AuditLog')[0];
  assert.doesNotThrow(() => JSON.parse(log.details), 'audit details must stay valid JSON');
  assert.ok(log.details.length <= 2000);
});

// ------------------------------------------------------------------ write behaviour

test('updateStudentProgression: a partial save preserves the omitted field', async () => {
  const world = makeWorld();
  const res = await invoke(FN, world, { student_id: IDS.student, swimming_level: 'advanced' });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.changed, ['swimming_level']);
  const update = world.writesFor('Student')[0];
  assert.deepEqual(update.args[1], { swimming_level: 'advanced' }, 'only the changed field is written');
  assert.equal(world.store.Student[0].swimming_level, 'advanced');
  assert.equal(
    world.store.Student[0].skill_progression,
    'Floating and kicking with a board',
    'progression notes must survive a level-only save'
  );
});

test('updateStudentProgression: an empty progression string clears the notes', async () => {
  const world = makeWorld();
  const res = await invoke(FN, world, { student_id: IDS.student, skill_progression: '   ' });
  assert.equal(res.status, 200);
  assert.equal(world.store.Student[0].skill_progression, null);
  assert.equal(world.store.Student[0].swimming_level, 'beginner', 'level survives');
});

test('updateStudentProgression: no-op sends 0 writes and 0 audit entries', async () => {
  const world = makeWorld();
  const before = world.snapshot();
  const res = await invoke(FN, world, {
    student_id: IDS.student,
    swimming_level: 'beginner',
    skill_progression: '  Floating and kicking with a board  '
  });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.changed, []);
  assert.equal(world.writes().length, 0, 'no write for an unchanged value');
  assert.equal(world.rows('AuditLog').length, 0, 'no audit entry for an unchanged value');
  assert.deepEqual(world.snapshot(), before);
});

test('updateStudentProgression: both fields can change in one save', async () => {
  const world = makeWorld();
  const res = await invoke(FN, world, {
    student_id: IDS.student,
    swimming_level: 'intermediate',
    skill_progression: 'Freestyle 25m unassisted'
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.changed.sort(), ['skill_progression', 'swimming_level']);
  assert.equal(world.writesFor('Student').length, 1, 'one update, not one per field');
  assert.equal(world.store.Student[0].swimming_level, 'intermediate');
  assert.equal(world.store.Student[0].skill_progression, 'Freestyle 25m unassisted');
});

// -------------------------------------------------------------------------- audit

test('updateStudentProgression: audit entry carries actor, branch and before/after only', async () => {
  const world = makeWorld();
  await invoke(FN, world, { student_id: IDS.student, swimming_level: 'advanced' });

  const log = world.rows('AuditLog')[0];
  assert.equal(log.action, 'student_progression_updated');
  assert.equal(log.actor_user_id, IDS.adminUser);
  assert.equal(log.actor_email, 'admin@academy.test');
  assert.equal(log.target_type, 'student');
  assert.equal(log.target_id, IDS.student);
  assert.equal(log.branch_id, IDS.branch1);

  const details = JSON.parse(log.details);
  assert.deepEqual(details.changed, ['swimming_level']);
  assert.deepEqual(details.before, { swimming_level: 'beginner' });
  assert.deepEqual(details.after, { swimming_level: 'advanced' });

  // No PII or unrelated profile data is copied into the audit record.
  const auditText = JSON.stringify(log);
  for (const leak of ['Mild asthma', '0123456789', IDS.parentUser, 'Nur Rahman']) {
    assert.equal(auditText.includes(leak), false, `audit record leaked "${leak}"`);
  }
});

test('updateStudentProgression: response projection omits the owning account id', async () => {
  const world = makeWorld();
  const res = await invoke(FN, world, { student_id: IDS.student, swimming_level: 'advanced' });
  assert.equal('account_id' in res.body.student, false);
  assert.equal(res.body.student.medical_notes, 'Mild asthma', 'admin sees the safety note');
  assert.equal(res.body.audit_recorded, true);
});

test('updateStudentProgression: an audit failure does not roll back the saved change', async () => {
  const world = makeWorld();
  world.failOn(
    (entity, op) => entity === 'AuditLog' && op === 'create',
    new Error('audit store unavailable')
  );

  const { result: res, logged } = await captureErrors(() =>
    invoke(FN, world, { student_id: IDS.student, swimming_level: 'advanced' })
  );

  assert.equal(res.status, 200, 'the saved change is reported as saved, not as a total failure');
  assert.equal(res.body.audit_recorded, false, 'the missing audit row is disclosed');
  assert.equal(world.store.Student[0].swimming_level, 'advanced', 'the write persists');
  assert.equal(world.writesFor('Student').length, 1, 'no compensating rollback write');
  assert.equal(world.rows('AuditLog').length, 0);
  assert.ok(
    logged.some((line) => line.includes('audit write failed')),
    'the gap is logged server-side'
  );
});

// ---------------------------------------------------------------------- failures

test('updateStudentProgression: a database failure is a generic 500 with no leak', async () => {
  const world = makeWorld();
  world.failOn(
    (entity, op) => entity === 'Student' && op === 'get',
    Object.assign(new Error('rate limit exceeded: 140 per 60s'), { status: 429 })
  );

  const { result: res, logged } = await captureErrors(() => invoke(FN, world, base()));

  assert.equal(res.status, 500);
  assert.equal(res.body.error, GENERIC_FAILURE);
  const body = JSON.stringify(res.body);
  for (const leak of ['rate limit', '140', 'sdkMock']) {
    assert.equal(body.includes(leak), false, `500 body leaked "${leak}"`);
  }
  assert.ok(logged.some((line) => line.includes('unexpected failure')));
  assert.equal(world.writes().length, 0);
});

test('updateStudentProgression: a failed write leaves the stored record untouched', async () => {
  const world = makeWorld();
  const before = world.snapshot();
  world.failOn(
    (entity, op) => entity === 'Student' && op === 'update',
    new Error('write failed')
  );

  const { result: res } = await captureErrors(() => invoke(FN, world, base()));
  assert.equal(res.status, 500);
  assert.equal(res.body.error, GENERIC_FAILURE);
  assert.deepEqual(world.snapshot(), before, 'no partial change and no audit row');
});