import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, invoke, captureErrors, IDS, GENERIC_FAILURE } from '../harness/world.mjs';

// The three self-service profile handlers that create/update a swimmer profile.
// updateStudentProgression is the ONLY privileged path for these two fields, so
// every one of these must refuse them outright — never silently strip them, which
// would let a client believe the level had been set.

const VARIANTS = [
  { label: 'a real value', value: (field) => (field === 'swimming_level' ? 'beginner' : 'Working on breathing') },
  { label: 'null', value: () => null },
  { label: 'an empty string', value: () => '' }
];

const CASES = [
  {
    fn: 'createMyStudentProfile',
    user: { id: IDS.memberUser, email: 'member@academy.test', role: 'user' },
    base: { full_name: 'Hafiz Ismail', date_of_birth: '2005-02-14', gender: 'male' },
    okStatus: 201
  },
  {
    fn: 'createDependentStudentProfile',
    user: { id: IDS.parentUser, email: 'parent@academy.test', role: 'user' },
    base: { full_name: 'Ilham Rahman', date_of_birth: '2017-09-09', relationship: 'child' },
    okStatus: 201
  },
  {
    fn: 'updateMyStudentProfile',
    user: { id: IDS.parentUser, email: 'parent@academy.test', role: 'user' },
    base: { student_id: IDS.student, full_name: 'Aisyah Rahman Binti' },
    okStatus: 200
  }
];

for (const c of CASES) {
  test(`${c.fn}: refuses swimming_level and skill_progression before any write`, async () => {
    for (const field of ['swimming_level', 'skill_progression']) {
      for (const variant of VARIANTS) {
        const world = makeWorld({ user: c.user });
        const before = world.snapshot();

        const res = await invoke(c.fn, world, { ...c.base, [field]: variant.value(field) });

        assert.equal(res.status, 400, `${field}=${variant.label} was not refused (${JSON.stringify(res.body)})`);
        assert.ok(
          String(res.body.error).includes(field),
          `${field}=${variant.label}: error should name the field, got "${res.body.error}"`
        );
        assert.equal(world.writes().length, 0, `${field}=${variant.label} wrote to the database`);
        for (const entity of ['Student', 'UserRole', 'User']) {
          assert.equal(world.writesFor(entity).length, 0, `${field} caused a ${entity} write`);
        }
        assert.deepEqual(world.snapshot(), before, `${field}=${variant.label} changed stored data`);
      }
    }
  });

  test(`${c.fn}: a healthy payload without those fields still succeeds`, async () => {
    const world = makeWorld({ user: c.user });
    const res = await invoke(c.fn, world, c.base);

    assert.equal(res.status, c.okStatus, JSON.stringify(res.body));

    if (c.fn === 'updateMyStudentProfile') {
      const update = world.writesFor('Student')[0];
      assert.deepEqual(update.args[1], { full_name: 'Aisyah Rahman Binti' });
      assert.equal(world.store.Student[0].swimming_level, 'beginner', 'level untouched by a name edit');
      assert.equal(world.store.Student[0].skill_progression, 'Floating and kicking with a board');
      assert.equal(world.rows('AuditLog').length, 0, 'self-service writes no assessment audit entry');
    } else {
      const created = world.writesFor('Student')[0].args[0];
      assert.equal('swimming_level' in created, false, 'no level is stored at creation');
      assert.equal('skill_progression' in created, false, 'no progression is stored at creation');
    }
  });

  test(`${c.fn}: a database failure is a generic 500 with no internal detail`, async () => {
    const world = makeWorld({ user: c.user });
    world.failOn(
      (entity) => entity === 'Student',
      Object.assign(new Error('connection refused: db-internal-42'), { status: 503 })
    );

    const { result: res, logged } = await captureErrors(() => invoke(c.fn, world, c.base));

    assert.equal(res.status, 500);
    assert.equal(res.body.error, GENERIC_FAILURE);
    assert.equal(JSON.stringify(res.body).includes('db-internal-42'), false);
    assert.ok(logged.some((line) => line.includes('unexpected failure')));
    assert.equal(world.writes().length, 0);
  });
}

test('createMyStudentProfile: the account owner is taken from the session, never the body', async () => {
  const world = makeWorld({ user: { id: IDS.memberUser, email: 'member@academy.test', role: 'user' } });
  const res = await invoke('createMyStudentProfile', world, {
    full_name: 'Hafiz Ismail',
    date_of_birth: '2005-02-14',
    account_id: IDS.parentUser
  });
  assert.equal(res.status, 400, 'account_id must be refused when supplied');
  assert.equal(world.writes().length, 0);
});

test('updateMyStudentProfile: another account cannot edit the profile (403), and nothing changes', async () => {
  const world = makeWorld({ user: { id: IDS.memberUser, email: 'member@academy.test', role: 'user' } });
  const before = world.snapshot();
  const res = await invoke('updateMyStudentProfile', world, {
    student_id: IDS.student,
    full_name: 'Not Mine'
  });
  assert.equal(res.status, 403);
  assert.equal(world.writes().length, 0);
  assert.deepEqual(world.snapshot(), before);
});

test('updateMyStudentProfile: a genuine missing profile is 404, a database failure is not', async () => {
  const world = makeWorld({ user: { id: IDS.parentUser, email: 'parent@academy.test', role: 'user' } });
  const missing = await invoke('updateMyStudentProfile', world, {
    student_id: 'stu_missing',
    full_name: 'Ghost'
  });
  assert.equal(missing.status, 404);

  const failing = makeWorld({ user: { id: IDS.parentUser, email: 'parent@academy.test', role: 'user' } });
  failing.failOn(
    (entity, op) => entity === 'Student' && op === 'filter',
    Object.assign(new Error('rate limit exceeded'), { status: 429 })
  );
  const { result: res } = await captureErrors(() =>
    invoke('updateMyStudentProfile', failing, { student_id: IDS.student, full_name: 'Ghost' })
  );
  assert.equal(res.status, 500, 'a temporary failure must never read as "profile not found"');
  assert.equal(res.body.error, GENERIC_FAILURE);
});

test('createDependentStudentProfile: requires a verified parent role', async () => {
  const world = makeWorld({ user: { id: IDS.memberUser, email: 'member@academy.test', role: 'user' } });
  const res = await invoke('createDependentStudentProfile', world, {
    full_name: 'Ilham Rahman',
    date_of_birth: '2017-09-09',
    relationship: 'child'
  });
  assert.equal(res.status, 403);
  assert.equal(world.writes().length, 0);
});