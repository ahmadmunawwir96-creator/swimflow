// Formatting helpers shared by the directory table, the mobile swimmer list and
// the student profile, so the same swimmer reads identically wherever they appear.

export const STATUS_LABEL = {
  active: 'Active',
  trial: 'Trial',
  inactive: 'Inactive',
  left: 'Left'
};

export const STATUS_STYLE = {
  active: 'bg-brand text-brand-foreground',
  trial: 'bg-sun text-sun-foreground',
  inactive: 'bg-muted text-muted-foreground',
  left: 'bg-muted text-muted-foreground'
};

export const LEVEL_LABEL = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced'
};

export const MANAGED_BY_LABEL = {
  self: 'Self-managed',
  dependent: 'Parent / guardian'
};

export const RELATIONSHIP_LABEL = {
  self: 'Self',
  child: 'Child',
  dependant: 'Dependant',
  ward: 'Ward',
  sibling: 'Sibling'
};

export const CONSENT_LABEL = {
  not_required: 'Not required',
  pending: 'Pending',
  given: 'Given',
  refused: 'Refused'
};

export function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age -= 1;
  return age >= 0 ? age : null;
}

// A date-only value is read as UTC midnight so the calendar day never shifts.
export function formatDate(value) {
  if (!value) return null;
  const d = new Date(value.length <= 10 ? value + 'T00:00:00Z' : value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ageLabel(student) {
  const age = ageFromDob(student?.date_of_birth);
  return age === null ? 'Age not recorded' : `${age} years old`;
}

export function branchLabel(student) {
  return student?.home_branch_name || 'Unassigned';
}

export function statusLabel(status) {
  return STATUS_LABEL[status] || status || '—';
}

export function statusStyle(status) {
  return STATUS_STYLE[status] || '';
}