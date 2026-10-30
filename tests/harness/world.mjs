// A small fixture world for handler tests: an in-memory dataset, a fake request,
// and helpers to invoke a backend function's real default export.
import { createClientFromRequest, isWriteOp } from './sdkMock.mjs';

export const IDS = {
  adminUser: 'u_admin',
  coachUser: 'u_coach',
  parentUser: 'u_parent',
  memberUser: 'u_member',
  platformAdmin: 'u_platform_admin',
  adminRole: 'role_admin',
  coachRole: 'role_coach',
  parentRole: 'role_parent',
  studentRole: 'role_student',
  branch1: 'br_1',
  branch2: 'br_2',
  student: 'stu_1'
};

const clone = (v) => JSON.parse(JSON.stringify(v));

export function defaultSeed() {
  return {
    Role: [
      { id: IDS.adminRole, name: 'admin', is_active: true },
      { id: IDS.coachRole, name: 'coach', is_active: true },
      { id: IDS.parentRole, name: 'parent', is_active: true },
      { id: IDS.studentRole, name: 'student', is_active: true }
    ],
    Branch: [
      { id: IDS.branch1, name: 'Bukit Jalil', is_active: true },
      { id: IDS.branch2, name: 'Subang', is_active: true }
    ],
    // The academy admin under test: all-branches scope, active admin role.
    AdminBranchAssignment: [
      { id: 'aba_1', user_id: IDS.adminUser, all_branches: true, is_active: true }
    ],
    UserRole: [
      { id: 'ur_admin', user_id: IDS.adminUser, role_id: IDS.adminRole, is_active: true },
      { id: 'ur_parent', user_id: IDS.parentUser, role_id: IDS.parentRole, is_active: true }
    ],
    Student: [
      {
        id: IDS.student,
        account_id: IDS.parentUser,
        home_branch_id: IDS.branch1,
        full_name: 'Aisyah Rahman',
        date_of_birth: '2016-04-12',
        gender: 'female',
        swimming_level: 'beginner',
        skill_progression: 'Floating and kicking with a board',
        medical_notes: 'Mild asthma',
        emergency_contact_name: 'Nur Rahman',
        emergency_contact_phone: '0123456789',
        ownership_type: 'dependent',
        relationship: 'child',
        status: 'active',
        consent_status: 'not_required',
        date_joined: '2026-01-02'
      }
    ],
    User: [
      {
        id: IDS.parentUser,
        email: 'parent@academy.test',
        full_name: 'Nur Rahman',
        role: 'user'
      }
    ],
    AuditLog: []
  };
}

/**
 * @param {object} options
 * @param {object} [options.user]      the caller returned by auth.me()
 * @param {string} [options.authMode]  'user' | 'null' | 'throw'
 * @param {object} [options.seed]      dataset (deep-cloned, never shared)
 */
export function makeWorld(options = {}) {
  const store = clone(options.seed || defaultSeed());
  const mock = {
    store,
    calls: [],
    authMode: options.authMode || 'user',
    user: options.user || { id: IDS.adminUser, email: 'admin@academy.test', role: 'user' },
    fail: options.fail || null,
    entityCache: null
  };

  const world = {
    mock,
    store,
    get calls() {
      return mock.calls;
    },
    writes() {
      return mock.calls.filter((c) => isWriteOp(c.op));
    },
    writesFor(entity) {
      return world.writes().filter((c) => c.entity === entity);
    },
    rows(entity) {
      return store[entity] || [];
    },
    snapshot() {
      return clone(store);
    },
    // Inject a failure for calls that match, e.g.
    //   world.failOn((entity, op) => entity === 'AuditLog' && op === 'create')
    failOn(predicate, error) {
      mock.fail = (entity, op, args) => (predicate(entity, op, args) ? error : null);
    },
    request(body, extra = {}) {
      const raw = typeof body === 'string' ? body : JSON.stringify(body === undefined ? {} : body);
      return {
        __mock: mock,
        method: 'POST',
        headers: {},
        ...extra,
        async json() {
          return JSON.parse(raw);
        }
      };
    }
  };
  return world;
}

// Import a function's REAL entry module and invoke its default export.
export async function invoke(fnName, world, body, extra) {
  const url = new URL(`../../base44/functions/${fnName}/entry.ts`, import.meta.url);
  const mod = await import(url.href);
  const req = world.request(body, extra);
  const res = await mod.default(req);
  let parsed = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed };
}

// Run `fn` while capturing console.error, so the noisy 500 paths do not clutter
// output and a test can assert what was logged server-side.
export async function captureErrors(fn) {
  const original = console.error;
  const logged = [];
  console.error = (...args) => {
    logged.push(args.map((a) => (a instanceof Error ? a.stack || a.message : String(a))).join(' '));
  };
  try {
    const result = await fn();
    return { result, logged };
  } finally {
    console.error = original;
  }
}

export const GENERIC_FAILURE =
  'This information could not be loaded right now. Please try again.';