// Test-only: a stubbed global fetch that answers supabase-js (PostgREST,
// auth, storage, functions) and any external API the handlers call.
//
//   const api = fakeSupabase({
//     'GET profiles': [{ id: 'u1', email_alerts_enabled: true }],
//     'PATCH profiles': (call) => null,
//     'GET auth/user': { id: 'u1', email: 'sam@example.com' },
//     'HEAD check_ins': 5, // count-only query
//     'POST https://api.brevo.com/v3/smtp/email': { messageId: 'm1' },
//   });
//   try { ...call handler... } finally { api.restore(); }
//   api.calls('PATCH profiles')[0].body
//
// A route value is the JSON response body, a function of the call returning
// one, or a Response for full control (status codes, errors). Unrouted
// requests fail the test loudly.

export type Call = {
  method: string;
  key: string;
  url: URL;
  table: string;
  params: URLSearchParams;
  headers: Headers;
  body: unknown;
};
type RouteValue = unknown | ((call: Call) => unknown);

export const SUPABASE_URL = 'https://fake.supabase.co';

export function setFunctionEnv(extra: Record<string, string> = {}) {
  const env: Record<string, string> = {
    SUPABASE_URL,
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    NOTIFY_LINK_SECRET: 'test-secret',
    ...extra,
  };
  for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);
  return () => Object.keys(env).forEach((k) => Deno.env.delete(k));
}

function keyFor(url: URL, method: string): { key: string; table: string } {
  if (url.origin !== SUPABASE_URL) {
    return { key: `${method} ${url.origin}${url.pathname}`, table: '' };
  }
  const path = url.pathname;
  for (const [prefix, label] of [
    ['/rest/v1/', ''],
    ['/auth/v1/', 'auth/'],
    ['/storage/v1/object/', 'storage/'],
    ['/functions/v1/', 'functions/'],
  ] as const) {
    if (path.startsWith(prefix)) {
      const rest = path.slice(prefix.length);
      // auth/admin/users/<id> → auth/admin/users
      const trimmed = label === 'auth/' ? rest.replace(/^(admin\/users)\/.+$/, '$1') : rest;
      // storage/sign/<bucket>/<path> and storage/<bucket>/<path> → storage/<bucket>
      const bucket =
        label === 'storage/' ? trimmed.replace(/^(sign\/)?([^/]+).*$/, '$1$2') : trimmed;
      return { key: `${method} ${label}${bucket}`, table: trimmed };
    }
  }
  return { key: `${method} ${path}`, table: '' };
}

export function fakeSupabase(routes: Record<string, RouteValue>) {
  const log: Call[] = [];
  const original = globalThis.fetch;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const { key, table } = keyFor(url, method);
    const text = await req.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // keep raw text
    }
    const call: Call = {
      method,
      key,
      url,
      table,
      params: url.searchParams,
      headers: req.headers,
      body,
    };
    log.push(call);

    if (!(key in routes)) {
      throw new Error(`fakeSupabase: no route for "${key}" (${url.href})`);
    }
    const route = routes[key];
    const value = typeof route === 'function' ? (route as (c: Call) => unknown)(call) : route;
    if (value instanceof Response) return value;

    // select(..., { count: 'exact', head: true }) is a HEAD request whose
    // count comes back in Content-Range; route it with a number.
    if (method === 'HEAD') {
      const count = typeof value === 'number' ? value : 0;
      return new Response(null, { status: 200, headers: { 'Content-Range': `*/${count}` } });
    }

    // PostgREST .single()/.maybeSingle() ask for one object.
    const wantsObject = req.headers.get('Accept')?.includes('vnd.pgrst.object') ?? false;
    let payload = value;
    if (wantsObject && Array.isArray(value)) {
      if (value.length === 0) {
        return new Response(
          JSON.stringify({
            code: 'PGRST116',
            message: 'JSON object requested, multiple (or no) rows returned',
            details: 'The result contains 0 rows',
            hint: null,
          }),
          { status: 406, headers: { 'Content-Type': 'application/json' } },
        );
      }
      payload = value[0];
    }
    return new Response(payload === undefined ? null : JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  return {
    calls: (key?: string) => (key ? log.filter((c) => c.key === key) : [...log]),
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

/** JSON error response, e.g. for a failed PostgREST or external call. */
export const errorResponse = (status: number, body: unknown = { message: 'error' }) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A Request to a handler, with JSON body and optional bearer token. */
export function request(
  body: unknown,
  {
    method = 'POST',
    token,
    url = 'https://fn.local/',
    headers = {},
  }: {
    method?: string;
    token?: string;
    url?: string;
    headers?: Record<string, string>;
  } = {},
) {
  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: method === 'GET' || method === 'OPTIONS' ? undefined : JSON.stringify(body),
  });
}

/** Silence console output from handlers (they log on purpose) during fn. */
export async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, saved);
  }
}

/**
 * Let fire-and-forget work a handler started (e.g. recordLookup) finish
 * against the fake before it is restored — otherwise it would hit the network.
 */
export const settle = () => new Promise((r) => setTimeout(r, 20));
