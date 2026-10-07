import { assertEquals } from 'jsr:@std/assert@1';
import { handler } from './handler.ts';
import {
  errorResponse,
  fakeSupabase,
  quiet,
  request,
  setFunctionEnv,
} from '../_testing/fakeSupabase.ts';

// auth-js validates that admin user ids are UUIDs.
const UID = '6f1c2a3b-0000-4000-8000-000000000001';
const USER = { id: UID, email: 'sam@example.com', aud: 'authenticated' };

function setup(routes: Record<string, unknown> = {}) {
  const cleanup = setFunctionEnv();
  const api = fakeSupabase({
    'GET auth/user': USER,
    'GET receipts': [
      { image_path: `${UID}/a.jpg` },
      { image_path: null },
      { image_path: `${UID}/b.jpg` },
    ],
    'DELETE storage/receipts': [],
    'DELETE auth/admin/users': {},
    ...routes,
  });
  return { api, done: () => (api.restore(), cleanup()) };
}

Deno.test('delete-account: removes receipt images, then the auth user', async () => {
  const { api, done } = setup();
  try {
    const res = await quiet(() => handler(request({}, { token: 'jwt' })));
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { deleted: true, imagesRemoved: 2 });

    assertEquals(api.calls('GET receipts')[0].params.get('user_id'), `eq.${UID}`);
    assertEquals(api.calls('DELETE storage/receipts')[0].body, {
      prefixes: [`${UID}/a.jpg`, `${UID}/b.jpg`],
    });
    const del = api.calls('DELETE auth/admin/users')[0];
    assertEquals(del.url.pathname.endsWith(`/admin/users/${UID}`), true);
    // The account deleted is the caller's — taken from the JWT, never a parameter.
    assertEquals(api.calls('GET auth/user')[0].headers.get('Authorization'), 'Bearer jwt');
  } finally {
    done();
  }
});

Deno.test('delete-account: a user with no images skips storage', async () => {
  const { api, done } = setup({ 'GET receipts': [] });
  try {
    const res = await quiet(() => handler(request({}, { token: 'jwt' })));
    assertEquals(await res.json(), { deleted: true, imagesRemoved: 0 });
    assertEquals(api.calls('DELETE storage/receipts').length, 0);
  } finally {
    done();
  }
});

Deno.test('delete-account: storage cleanup failure does not block deletion', async () => {
  const { done } = setup({
    'DELETE storage/receipts': errorResponse(500, { message: 'storage down' }),
  });
  try {
    const res = await quiet(() => handler(request({}, { token: 'jwt' })));
    assertEquals(res.status, 200);
    assertEquals((await res.json()).deleted, true);
  } finally {
    done();
  }
});

Deno.test('delete-account: rejects an invalid token', async () => {
  const { api, done } = setup({ 'GET auth/user': errorResponse(401, { message: 'invalid JWT' }) });
  try {
    const res = await quiet(() => handler(request({}, { token: 'bad' })));
    assertEquals(res.status, 401);
    assertEquals(await res.json(), { error: 'Unauthorized' });
    assertEquals(api.calls('DELETE auth/admin/users').length, 0);
  } finally {
    done();
  }
});

Deno.test('delete-account: reports a failed user delete', async () => {
  const { done } = setup({
    'DELETE auth/admin/users': errorResponse(500, { msg: 'boom', message: 'boom' }),
  });
  try {
    const res = await quiet(() => handler(request({}, { token: 'jwt' })));
    assertEquals(res.status, 500);
  } finally {
    done();
  }
});

Deno.test('delete-account: answers CORS preflight', async () => {
  const res = await handler(request(null, { method: 'OPTIONS' }));
  assertEquals(res.status, 200);
  await res.body?.cancel();
});
