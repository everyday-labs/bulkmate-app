// In-memory stand-in for the Supabase client used by screens and lib code.
//
// Tests describe what each table / function / auth call should return, then
// assert on what was called:
//
//   mockTable('receipts', { data: [{ id: 'r1', total_amount: 12.5 }] });
//   mockTable('profiles', (q) => (q.op === 'update' ? { data: null } : { data: profile }));
//   ...render...
//   expect(lastQuery('profiles')?.payload).toEqual({ first_name: 'Sam' });

export type QueryResult = { data: any; error: any; count?: number | null };
export type RecordedQuery = {
  table: string;
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  columns?: string;
  payload?: any;
  filters: [string, ...any[]][];
  single: boolean;
};
type Responder = QueryResult | ((q: RecordedQuery) => QueryResult);

const tables = new Map<string, Responder>();
const functionResults = new Map<string, Responder>();
export const queries: RecordedQuery[] = [];

const ok = (data: any = null): QueryResult => ({ data, error: null, count: null });

export function mockTable(table: string, result: Responder | any[]) {
  tables.set(table, Array.isArray(result) ? ok(result) : result);
}

export function mockFunction(name: string, result: Responder) {
  functionResults.set(name, result);
}

export const lastQuery = (table: string) => [...queries].reverse().find((q) => q.table === table);
export const queriesFor = (table: string) => queries.filter((q) => q.table === table);

function resolve(q: RecordedQuery): Promise<QueryResult> {
  const r = tables.get(q.table);
  let result = typeof r === 'function' ? r(q) : (r ?? ok(q.single ? null : []));
  if (q.single && Array.isArray(result.data)) result = { ...result, data: result.data[0] ?? null };
  return Promise.resolve({ count: null, ...result });
}

const FILTERS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'is',
  'like',
  'ilike',
  'or',
  'not',
  'match',
  'filter',
  'contains',
  'order',
  'limit',
  'range',
  'textSearch',
] as const;

function queryBuilder(table: string) {
  const q: RecordedQuery = { table, op: 'select', filters: [], single: false };
  queries.push(q);
  const b: any = {};
  b.select = jest.fn((columns?: string) => {
    if (q.op === 'select') q.columns = columns;
    return b;
  });
  for (const op of ['insert', 'update', 'upsert', 'delete'] as const) {
    b[op] = jest.fn((payload?: any) => {
      q.op = op;
      q.payload = payload;
      return b;
    });
  }
  for (const f of FILTERS) {
    b[f] = jest.fn((...args: any[]) => {
      q.filters.push([f, ...args]);
      return b;
    });
  }
  b.single = jest.fn(() => {
    q.single = true;
    return resolve(q);
  });
  b.maybeSingle = b.single;
  b.then = (onOk: any, onErr: any) => resolve(q).then(onOk, onErr);
  return b;
}

export const TEST_USER = {
  id: 'user-1',
  email: 'sam@example.com',
  user_metadata: {},
  app_metadata: {},
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00Z',
};
export const TEST_SESSION = { access_token: 'access-token', user: TEST_USER };

const authListeners = new Set<(event: string, session: any) => void>();

export const supabaseMock = {
  from: jest.fn((table: string) => queryBuilder(table)),
  rpc: jest.fn(() => Promise.resolve(ok())),
  functions: {
    invoke: jest.fn((name: string, opts?: any) => {
      const r = functionResults.get(name);
      const q = {
        table: `fn:${name}`,
        op: 'select',
        payload: opts?.body,
        filters: [],
        single: false,
      } as RecordedQuery;
      queries.push(q);
      return Promise.resolve(typeof r === 'function' ? r(q) : (r ?? ok({})));
    }),
  },
  storage: {
    from: jest.fn(() => ({
      upload: jest.fn(() => Promise.resolve(ok({ path: 'p' }))),
      remove: jest.fn(() => Promise.resolve(ok([]))),
      createSignedUrl: jest.fn(() =>
        Promise.resolve(ok({ signedUrl: 'https://example.com/signed.jpg' })),
      ),
      getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'https://example.com/public.jpg' } })),
    })),
  },
  auth: {
    getSession: jest.fn(() =>
      Promise.resolve({ data: { session: TEST_SESSION as any }, error: null }),
    ),
    getUser: jest.fn(() => Promise.resolve({ data: { user: TEST_USER }, error: null })),
    onAuthStateChange: jest.fn((cb: (event: string, session: any) => void) => {
      authListeners.add(cb);
      return { data: { subscription: { unsubscribe: jest.fn(() => authListeners.delete(cb)) } } };
    }),
    signInWithPassword: jest.fn(() =>
      Promise.resolve({ data: { session: TEST_SESSION }, error: null as any }),
    ),
    signInWithIdToken: jest.fn(() =>
      Promise.resolve({ data: { session: TEST_SESSION }, error: null as any }),
    ),
    signUp: jest.fn(() =>
      Promise.resolve({ data: { user: TEST_USER, session: null }, error: null as any }),
    ),
    signOut: jest.fn(() => Promise.resolve({ error: null })),
    verifyOtp: jest.fn(() =>
      Promise.resolve({ data: { session: TEST_SESSION }, error: null as any }),
    ),
    resend: jest.fn(() => Promise.resolve({ data: {}, error: null as any })),
    resetPasswordForEmail: jest.fn(() => Promise.resolve({ data: {}, error: null as any })),
    updateUser: jest.fn(() => Promise.resolve({ data: { user: TEST_USER }, error: null as any })),
  },
};

/** Fire an auth event at every onAuthStateChange subscriber. */
export function emitAuthChange(event: string, session: any) {
  authListeners.forEach((cb) => cb(event, session));
}

export function signedOut() {
  supabaseMock.auth.getSession.mockImplementation(() =>
    Promise.resolve({ data: { session: null }, error: null }),
  );
}

export function resetSupabaseMock() {
  tables.clear();
  functionResults.clear();
  queries.length = 0;
  authListeners.clear();
  supabaseMock.auth.getSession.mockImplementation(() =>
    Promise.resolve({ data: { session: TEST_SESSION as any }, error: null }),
  );
}
