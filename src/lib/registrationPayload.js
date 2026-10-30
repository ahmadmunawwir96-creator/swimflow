// Builds the exact body sent to the registerAccount backend function.
//
// Why this exists instead of spreading the form state: whatever happens to be in
// the page's `profile` object would otherwise be forwarded verbatim. Removing an
// input from the form is NOT enough — a stale value left in state (from an earlier
// step, another account type, or a future field) would still be sent, and the
// server would then have to reject the whole registration. Building the payload
// from an explicit per-account-type allowlist makes what leaves the browser
// something we can read and test.
//
// swimming_level and skill_progression are academy-admin controlled: they are not
// in any allowlist below, and are also filtered out defensively, so no code path
// here can ever send them (not even as null or an empty string).

export const ACCOUNT_TYPE_FIELDS = {
  // The swimmer is the account holder.
  independent: [
    'full_name',
    'date_of_birth',
    'gender',
    'emergency_contact_name',
    'emergency_contact_phone',
    'consent_guardian_name',
    'consent_guardian_phone'
  ],
  // The account holder manages a first child/dependant.
  parent_guardian: ['parent_name', 'parent_phone', 'relationship', 'full_name', 'date_of_birth', 'gender']
};

export const LEVEL_CONTROLLED_FIELDS = ['swimming_level', 'skill_progression'];

export function buildRegistrationPayload(accountType, profile) {
  const allowed = ACCOUNT_TYPE_FIELDS[accountType] || [];
  const payload = { account_type: accountType };
  const source = profile || {};

  allowed.forEach((field) => {
    if (LEVEL_CONTROLLED_FIELDS.includes(field)) return;
    const value = source[field];
    if (value === undefined) return;
    payload[field] = typeof value === 'string' ? value.trim() : value;
  });

  return payload;
}