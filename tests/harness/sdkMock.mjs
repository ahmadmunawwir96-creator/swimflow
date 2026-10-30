// In-memory stand-in for `npm:@base44/sdk@0.8.52`.
//
// It exists so handler tests can run the REAL entry.ts code with:
//   * no network and no live database,
//   * an explicit, per-test dataset,
//   * a complete record of every SDK call (reads AND writes), so a test can prove
//     a rejected request never reached a write,
//   * injectable failures, so generic-500 paths are testable.
//
// A handler calls createClientFromRequest(req). The fake request carries the
// per-test configuration on `req.__mock`; nothing is global, so tests never
// leak state into each other.

const WRITE_OPS = new Set([
  'create',
  'update',
  'delete',
  'bulkCreate',
  'bulkUpdate',
  'updateMany',
  'deleteMany'
]);

let idCounter = 0;
const nextId = (entity) => `${entity.toLowerCase()}_gen_${++idCounter}`;

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

// Deliberately narrow: equality plus the operators these handlers actually use.
// A query shape the mock does not understand fails the test loudly instead of
// silently matching everything.
function matches(row, query) {
  return Object.entries(query || {}).every(([key, expected]) => {
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$in' in expected) return (expected.$in || []).includes(row[key]);
      if ('$ne' in expected) return row[key] !== expected.$ne;
      if ('$exists' in expected) return (row[key] !== undefined) === Boolean(expected.$exists);
      throw new Error(`sdkMock: unsupported query operator on "${key}"`);
    }
    return row[key] === expected;
  });
}

function notFound(entity, id) {
  const error = new Error(`${entity} ${id} not found`);
  error.status = 404;
  error.code = 'not_found';
  return error;
}

function pageOf(rows, opts) {
  const limit = opts && Number.isInteger(opts.limit) ? opts.limit : rows.length;
  return { items: rows.slice(0, limit), next_cursor: null, has_more: rows.length > limit };
}

function entityApi(cfg, entity, role) {
  const rows = () => {
    if (!cfg.store[entity]) cfg.store[entity] = [];
    return cfg.store[entity];
  };

  const record = (op, args) => {
    cfg.calls.push({ role, entity, op, args: clone(args) });
    const injected = cfg.fail ? cfg.fail(entity, op, args) : null;
    if (injected) throw injected;
  };

  const api = {
    async get(id) {
      record('get', [id]);
      const row = rows().find((r) => r.id === id);
      if (!row) throw notFound(entity, id);
      return clone(row);
    },
    async filter(query, opts) {
      record('filter', [query, opts]);
      return pageOf(rows().filter((r) => matches(r, query)), opts);
    },
    async list(opts) {
      record('list', [opts]);
      if (opts && typeof opts === 'string') return pageOf(rows(), null);
      return pageOf(rows(), opts);
    },
    async count(query) {
      record('count', [query]);
      return rows().filter((r) => matches(r, query)).length;
    },
    async create(data) {
      record('create', [data]);
      const row = {
        id: data.id || nextId(entity),
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString(),
        ...clone(data)
      };
      rows().push(row);
      return clone(row);
    },
    async bulkCreate(list) {
      record('bulkCreate', [list]);
      return list.map((data) => {
        const row = { id: data.id || nextId(entity), ...clone(data) };
        rows().push(row);
        return clone(row);
      });
    },
    async update(id, data) {
      record('update', [id, data]);
      const row = rows().find((r) => r.id === id);
      if (!row) throw notFound(entity, id);
      Object.assign(row, clone(data), { updated_date: new Date().toISOString() });
      return clone(row);
    },
    async bulkUpdate(list) {
      record('bulkUpdate', [list]);
      return list.map(({ id, ...data }) => {
        const row = rows().find((r) => r.id === id);
        if (!row) throw notFound(entity, id);
        Object.assign(row, clone(data));
        return clone(row);
      });
    },
    async updateMany(query, patch) {
      record('updateMany', [query, patch]);
      const touched = rows().filter((r) => matches(r, query));
      const data = (patch && patch.$set) || {};
      touched.forEach((row) => Object.assign(row, clone(data)));
      return { updated: touched.length, has_more: false };
    },
    async delete(id) {
      record('delete', [id]);
      const idx = rows().findIndex((r) => r.id === id);
      if (idx > -1) rows().splice(idx, 1);
      return { success: true };
    },
    async deleteMany(query) {
      record('deleteMany', [query]);
      const before = rows().length;
      cfg.store[entity] = rows().filter((r) => !matches(r, query));
      return { deleted: before - cfg.store[entity].length };
    },
    async aggregate(query) {
      record('aggregate', [query]);
      throw new Error('sdkMock: aggregate is not implemented for these tests');
    },
    async subscribe() {
      record('subscribe', []);
      return () => {};
    }
  };
  return api;
}

function entitiesFor(cfg, role) {
  // Any entity name is available; unseen ones are empty collections.
  return new Proxy(
    {},
    {
      get(_target, entity) {
        if (typeof entity !== 'string') return undefined;
        if (!cfg.entityCache[role]) cfg.entityCache[role] = {};
        if (!cfg.entityCache[role][entity]) {
          cfg.entityCache[role][entity] = entityApi(cfg, entity, role);
        }
        return cfg.entityCache[role][entity];
      }
    }
  );
}

export function isWriteOp(op) {
  return WRITE_OPS.has(op);
}

export function createClientFromRequest(req) {
  const cfg = req && req.__mock;
  if (!cfg) {
    throw new Error('sdkMock: request is missing its __mock configuration');
  }
  cfg.entityCache = cfg.entityCache || { user: {}, service: {} };

  const authClient = {
    async me() {
      cfg.calls.push({ role: 'auth', entity: 'auth', op: 'me', args: [] });
      const mode = cfg.authMode || 'user';
      if (mode === 'throw') {
        const error = new Error('No session');
        error.status = 401;
        throw error;
      }
      if (mode === 'null') return null;
      return clone(cfg.user);
    },
    async updateMe(data) {
      cfg.calls.push({ role: 'auth', entity: 'auth', op: 'updateMe', args: [clone(data)] });
      return clone(data);
    },
    isAuthenticated: async () => (cfg.authMode || 'user') === 'user',
    logout: async () => {}
  };

  return {
    auth: authClient,
    entities: entitiesFor(cfg, 'user'),
    asServiceRole: {
      auth: authClient,
      entities: entitiesFor(cfg, 'service')
    },
    functions: {
      async invoke(name, payload) {
        throw new Error(`sdkMock: functions.invoke("${name}") is not available server-side`);
      }
    },
    users: {
      async inviteUser() {
        throw new Error('sdkMock: inviteUser is not expected in these tests');
      }
    }
  };
}