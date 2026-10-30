import test from 'node:test';
import assert from 'node:assert/strict';
import {
  serializeAuditDetails,
  AUDIT_DETAILS_MAX_LENGTH,
  AUDIT_CLIP_MARKER
} from '../../base44/shared/auditDetails.ts';

const parse = (text) => JSON.parse(text);

test('audit details: a normal payload is stored verbatim', () => {
  const payload = {
    changed: ['swimming_level'],
    before: { swimming_level: 'beginner' },
    after: { swimming_level: 'advanced' }
  };
  const text = serializeAuditDetails(payload);
  assert.deepEqual(parse(text), payload);
  assert.ok(text.length <= AUDIT_DETAILS_MAX_LENGTH);
});

test('audit details: long values are clipped into VALID json, never sliced', () => {
  const long = 'z'.repeat(5000);
  const text = serializeAuditDetails({
    changed: ['skill_progression'],
    before: { skill_progression: long },
    after: { skill_progression: long + 'x' }
  });

  // The whole point: a raw slice would throw here.
  const parsed = parse(text);
  assert.ok(text.length <= AUDIT_DETAILS_MAX_LENGTH, `length ${text.length}`);
  assert.equal(parsed.truncated, true);
  assert.deepEqual(parsed.changed, ['skill_progression']);
  assert.ok(parsed.before.skill_progression.endsWith(AUDIT_CLIP_MARKER));
  assert.ok(parsed.before.skill_progression.length < long.length);
});

test('audit details: values that already fit are not marked as truncated', () => {
  const text = serializeAuditDetails({
    changed: ['skill_progression'],
    before: { skill_progression: 'short note' },
    after: { skill_progression: 'short note two' }
  });
  const parsed = parse(text);
  assert.equal(parsed.truncated, undefined);
  assert.equal(parsed.before.skill_progression, 'short note');
});

test('audit details: an impossible length limit still returns parseable json', () => {
  const text = serializeAuditDetails(
    {
      changed: ['swimming_level', 'skill_progression'],
      before: { swimming_level: 'beginner', skill_progression: 'a'.repeat(400) },
      after: { swimming_level: 'advanced', skill_progression: 'b'.repeat(400) }
    },
    120
  );
  const parsed = parse(text);
  assert.equal(parsed.truncated, true);
  assert.deepEqual(parsed.changed, ['swimming_level', 'skill_progression']);
});

test('audit details: unicode and quotes survive the round trip', () => {
  const note = '"引号" and \n newlines é';
  const fits = parse(
    serializeAuditDetails({
      changed: ['skill_progression'],
      before: { skill_progression: note },
      after: { skill_progression: note }
    })
  );
  assert.equal(fits.after.skill_progression, note, 'short unicode text is stored unchanged');

  const long = 'é'.repeat(1500);
  const clipped = parse(
    serializeAuditDetails({
      changed: ['skill_progression'],
      before: { skill_progression: long },
      after: { skill_progression: long + long }
    })
  );
  assert.equal(clipped.truncated, true);
  assert.equal(typeof clipped.after.skill_progression, 'string');
  assert.ok(clipped.after.skill_progression.endsWith(AUDIT_CLIP_MARKER));
});

test('audit details: missing parts are normalised, never undefined', () => {
  const parsed = parse(serializeAuditDetails({}));
  assert.deepEqual(parsed, { changed: [], before: {}, after: {} });
});