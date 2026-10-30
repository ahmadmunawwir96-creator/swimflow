import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistrationPayload } from '../../src/lib/registrationPayload.js';

// Removing an input from the form is not enough: the page forwards its whole
// profile state. These tests pin what actually leaves the browser.

test('registration payload: controlled fields are never sent, whatever state holds', () => {
  const dirty = {
    full_name: 'Hafiz Ismail',
    date_of_birth: '2005-02-14',
    gender: 'male',
    swimming_level: 'advanced',
    skill_progression: 'Should never reach the server'
  };
  const payload = buildRegistrationPayload('independent', dirty);
  assert.equal('swimming_level' in payload, false);
  assert.equal('skill_progression' in payload, false);
  assert.deepEqual(payload, {
    account_type: 'independent',
    full_name: 'Hafiz Ismail',
    date_of_birth: '2005-02-14',
    gender: 'male'
  });
});

test('registration payload: null and empty controlled values are not sent either', () => {
  for (const value of [null, '']) {
    const payload = buildRegistrationPayload('parent_guardian', {
      parent_name: 'Nur Rahman',
      parent_phone: '0123456789',
      relationship: 'child',
      full_name: 'Ilham',
      date_of_birth: '2017-09-09',
      swimming_level: value,
      skill_progression: value
    });
    assert.equal('swimming_level' in payload, false);
    assert.equal('skill_progression' in payload, false);
  }
});

test('registration payload: independent does not carry parent-only fields', () => {
  const payload = buildRegistrationPayload('independent', {
    full_name: 'Hafiz',
    date_of_birth: '2005-02-14',
    parent_name: 'Left over from another step',
    parent_phone: '0123',
    relationship: 'child',
    unrelated: 'x'
  });
  assert.equal('parent_name' in payload, false);
  assert.equal('parent_phone' in payload, false);
  assert.equal('relationship' in payload, false);
  assert.equal('unrelated' in payload, false);
});

test('registration payload: parent/guardian keeps the fields the server requires', () => {
  const payload = buildRegistrationPayload('parent_guardian', {
    parent_name: '  Nur Rahman  ',
    parent_phone: '0123456789',
    relationship: 'child',
    full_name: '  Ilham Rahman ',
    date_of_birth: '2017-09-09',
    gender: 'male',
    emergency_contact_name: 'ignored for a dependent'
  });
  assert.deepEqual(payload, {
    account_type: 'parent_guardian',
    parent_name: 'Nur Rahman',
    parent_phone: '0123456789',
    relationship: 'child',
    full_name: 'Ilham Rahman',
    date_of_birth: '2017-09-09',
    gender: 'male'
  });
});

test('registration payload: absent values are omitted rather than sent as undefined', () => {
  const payload = buildRegistrationPayload('independent', { full_name: 'Hafiz' });
  assert.deepEqual(payload, { account_type: 'independent', full_name: 'Hafiz' });
});

test('registration payload: an unknown account type sends only the type', () => {
  assert.deepEqual(buildRegistrationPayload('nonsense', { full_name: 'X' }), {
    account_type: 'nonsense'
  });
  assert.deepEqual(buildRegistrationPayload(undefined, { full_name: 'X' }), {
    account_type: undefined
  });
});