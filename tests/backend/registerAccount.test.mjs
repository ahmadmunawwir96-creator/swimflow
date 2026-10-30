import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, invoke, captureErrors, IDS, GENERIC_FAILURE } from '../harness/world.mjs';

// registerAccount is the one self-service path that writes a UserRole and a
// Student. A refused registration must therefore leave all three entities
// untouched: Student, UserRole and User.

const INDEPENDENT = {
  account_type: 'independent',
  full_name: 'Hafiz Ismail',
  date_of_birth: '2005-02-14',
  gender: 'male'
};

const PARENT = {
  account_type: 'parent_guardian',
  parent_name: 'Nur Rahman',
  parent_phone: '0123456789',
  relationship: 'child',
  full_name: 'Ilham Rahman',
  date_of_birth: '2017-09-09'
};

const member = { id: IDS.memberUser, email: 'member@academy.test', role: 'user' };
const parentUser = { id: IDS.parentUser, email: 'parent@academy.test', role: 'user' };

const VARIANTS = [
  { label: 'a real value', value: (field) => (field === 'swimming_level' ? 'advanced' : 'Good breathing') },
  { label: 'null', value: () => null },
  { label: 'an empty string', value: () => '' }
];

test('registerAccount: BOTH account types refuse level and progression, with zero Student/UserRole/User writes', async () => {
  const types = [
    { label: 'independent', body: INDEPENDENT, user: member },
    { label: 'parent/guardian', body: PARENT, user: parentUser }
  ];

  for (const type of types) {
    for (const field of ['swimming_level', 'skill_progression']) {
      for (const variant of VARIANTS) {
        const world = makeWorld({ user: type.user });
        const before = world.snapshot();

        const res = await invoke('registerAccount', world, {
          ...type.body,
          [field]: variant.value(field)
        });

        assert.equal(
          res.status,
          400,
          `${type.label} / ${field}=${variant.label} was not refused (${JSON.stringify(res.body)})`
        );
        assert.ok(String(res.body.error).includes(field));
        assert.equal(world.writes().length, 0, `${type.label} / ${field}=${variant.label} wrote something`);
        for (const entity of ['Student', 'UserRole', 'User']) {
          assert.equal(
            world.writesFor(entity).length,
            0,
            `${type.label} / ${field}=${variant.label} wrote to ${entity}`
          );
        }
        assert.deepEqual(world.snapshot(), before);
      }
    }
  }
});

test('registerAccount: independent registration still works without the controlled fields', async () => {
  const world = makeWorld({ user: member });
  const res = await invoke('registerAccount', world, INDEPENDENT);

  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.role, 'student');

  const roleWrite = world.writesFor('UserRole')[0];
  assert.deepEqual(
    { user_id: roleWrite.args[0].user_id, role_id: roleWrite.args[0].role_id },
    { user_id: IDS.memberUser, role_id: IDS.studentRole }
  );

  const created = world.writesFor('Student')[0].args[0];
  assert.equal(created.ownership_type, 'self');
  assert.equal(created.relationship, 'self');
  assert.equal(created.account_id, IDS.memberUser);
  assert.equal('swimming_level' in created, false, 'registration must not store a level');
  assert.equal('skill_progression' in created, false, 'registration must not store progression');

  const userWrite = world.writesFor('User')[0];
  assert.deepEqual(userWrite.args[1], { display_name: 'Hafiz Ismail' });
});

test('registerAccount: parent/guardian registration still works without the controlled fields', async () => {
  const world = makeWorld({ user: parentUser });
  const res = await invoke('registerAccount', world, PARENT);

  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.role, 'parent');

  const created = world.writesFor('Student')[0].args[0];
  assert.equal(created.ownership_type, 'dependent');
  assert.equal(created.relationship, 'child');
  assert.equal(created.emergency_contact_name, 'Nur Rahman');
  assert.equal(created.emergency_contact_phone, '0123456789');
  assert.equal('swimming_level' in created, false);
  assert.equal('skill_progression' in created, false);
});

test('registerAccount: re-running the same registration does not duplicate the profile', async () => {
  const world = makeWorld({ user: member });
  const first = await invoke('registerAccount', world, INDEPENDENT);
  assert.equal(first.status, 201);

  const second = await invoke('registerAccount', world, INDEPENDENT);
  assert.equal(second.status, 201);
  assert.equal(world.writesFor('Student').length, 1, 'one profile created, not two');
  assert.equal(world.writesFor('UserRole').length, 1, 'one role assignment, not two');
});

test('registerAccount: an unsupported account type is 400 with no writes', async () => {
  const world = makeWorld({ user: member });
  const res = await invoke('registerAccount', world, { ...INDEPENDENT, account_type: 'coach' });
  assert.equal(res.status, 400);
  assert.equal(world.writes().length, 0);
});

test('registerAccount: a database failure is a generic 500 with no writes', async () => {
  const world = makeWorld({ user: member });
  world.failOn(
    (entity) => entity === 'Role',
    Object.assign(new Error('role store down: cluster-7'), { status: 503 })
  );

  const { result: res, logged } = await captureErrors(() => invoke('registerAccount', world, INDEPENDENT));

  assert.equal(res.status, 500);
  assert.equal(res.body.error, GENERIC_FAILURE);
  assert.equal(JSON.stringify(res.body).includes('cluster-7'), false);
  assert.ok(logged.some((line) => line.includes('unexpected failure')));
  assert.equal(world.writes().length, 0);
});