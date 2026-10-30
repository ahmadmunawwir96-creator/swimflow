// Serialization for AuditLog.details.
//
// details is stored as a STRING, so whatever we put there must always be valid
// JSON: an audit reader parses it, and a half-written object is worse than no
// detail at all. A raw string slice — the obvious way to bound the length — cuts
// the JSON at an arbitrary character and produces exactly that broken record.
//
// So the length bound is applied to the VALUES, never to the serialized text:
//   1. if the full payload fits, it is stored verbatim;
//   2. otherwise the long string values are clipped with an explicit marker and a
//      `truncated: true` flag is added;
//   3. if even that is too long, only the changed field names remain.
// Every branch returns text JSON.parse can read.

export const AUDIT_DETAILS_MAX_LENGTH = 2000;
export const AUDIT_CLIP_MARKER = '…[truncated]';
const CLIPPED_VALUE_LENGTH = 80;

function clipValues(source, maxValueLength) {
  const out = {};
  Object.keys(source || {}).forEach((key) => {
    const value = source[key];
    if (typeof value === 'string' && value.length > maxValueLength) {
      out[key] = value.slice(0, maxValueLength) + AUDIT_CLIP_MARKER;
    } else {
      out[key] = value === undefined ? null : value;
    }
  });
  return out;
}

/**
 * @param {{changed?: string[], before?: object, after?: object}} payload
 * @param {number} maxLength
 * @returns {string} always parseable JSON
 */
export function serializeAuditDetails(payload, maxLength = AUDIT_DETAILS_MAX_LENGTH) {
  const safe = payload || {};
  const full = JSON.stringify({
    changed: safe.changed || [],
    before: safe.before || {},
    after: safe.after || {}
  });
  if (full.length <= maxLength) return full;

  const compact = JSON.stringify({
    changed: safe.changed || [],
    truncated: true,
    before: clipValues(safe.before, CLIPPED_VALUE_LENGTH),
    after: clipValues(safe.after, CLIPPED_VALUE_LENGTH)
  });
  if (compact.length <= maxLength) return compact;

  // Last resort: the field names alone. Still valid JSON, still says what changed.
  return JSON.stringify({ changed: safe.changed || [], truncated: true });
}