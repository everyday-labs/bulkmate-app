import { assertEquals } from 'jsr:@std/assert@1';
import { handler } from './handler.ts';
import { errorResponse, fakeSupabase, request, setFunctionEnv } from '../_testing/fakeSupabase.ts';

const USER = { id: 'user-1', email: 'sam@example.com', aud: 'authenticated' };
// Almaden #470 and a far-away Legendary warehouse.
const ALMADEN = {
  id: 'w1',
  warehouse_code: '470',
  name: 'Almaden',
  city: 'San Jose',
  latitude: 37.2516,
  longitude: -121.8623,
  tier: 'Common',
};
const KONA = {
  id: 'w2',
  warehouse_code: '1092',
  name: 'Kona',
  city: 'Kailua-Kona',
  latitude: 19.6542,
  longitude: -155.9958,
  tier: 'Legendary',
};
const BADGES = [
  { id: 'b1', trigger_key: 'first_checkin', name: 'First Visit', icon: '🎉' },
  { id: 'b2', trigger_key: 'legendary_warehouse', name: 'Legend Hunter', icon: '🏆' },
  { id: 'b3', trigger_key: 'five_checkins', name: 'Regular', icon: '⭐' },
];

function setup(routes: Record<string, unknown> = {}) {
  const cleanup = setFunctionEnv();
  const api = fakeSupabase({
    'GET auth/user': USER,
    'GET warehouses': [ALMADEN, KONA, { ...KONA, id: 'w3', latitude: null, longitude: null }],
    'POST check_ins': null,
    'GET profiles': { total_stars: 2, fan_tier: 'KirklandCadet' },
    'PATCH profiles': null,
    'HEAD check_ins': 1,
    'GET check_ins': [{ warehouse_id: 'w1' }],
    'GET user_badges': [],
    'GET badges': BADGES,
    'POST user_badges': null,
    ...routes,
  });
  return { api, done: () => (api.restore(), cleanup()) };
}

const at = (wh: { latitude: number; longitude: number }) => ({
  latitude: wh.latitude + 0.0001,
  longitude: wh.longitude,
});

Deno.test('check-in: within 50m awards a star, tier and badges', async () => {
  const { api, done } = setup();
  try {
    const res = await handler(request(at(ALMADEN), { token: 'jwt' }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.warehouse.name, 'Almaden');
    assertEquals(body.warehouse.distance_metres, 11);
    assertEquals(body.stars_earned, 1);
    assertEquals(body.total_stars, 3);
    assertEquals(body.fan_tier, 'WholesaleWanderer');
    assertEquals(body.tier_upgraded, true);
    assertEquals(
      body.new_badges.map((b: { trigger_key: string }) => b.trigger_key),
      ['first_checkin'],
    );

    const [insert] = api.calls('POST check_ins');
    assertEquals((insert.body as { stars_earned: number }).stars_earned, 1);
    assertEquals(api.calls('PATCH profiles')[0].body, {
      total_stars: 3,
      fan_tier: 'WholesaleWanderer',
    });
    assertEquals(api.calls('POST user_badges')[0].body, [
      { user_id: 'user-1', badge_id: 'b1', warehouse_id: null },
    ]);
  } finally {
    done();
  }
});

Deno.test(
  'check-in: a Legendary warehouse earns its badge; earned badges are not repeated',
  async () => {
    const { done } = setup({
      'HEAD check_ins': 6,
      'GET user_badges': [{ badges: { trigger_key: 'first_checkin' } }],
    });
    try {
      const body = await (await handler(request(at(KONA), { token: 'jwt' }))).json();
      assertEquals(body.new_badges.map((b: { trigger_key: string }) => b.trigger_key).sort(), [
        'five_checkins',
        'legendary_warehouse',
      ]);
    } finally {
      done();
    }
  },
);

Deno.test('check-in: a second visit the same day is a no-op, not an error', async () => {
  const { api, done } = setup({
    'POST check_ins': errorResponse(409, {
      code: '23505',
      message: 'duplicate key value violates unique constraint "check_ins_user_warehouse_day"',
    }),
  });
  try {
    const body = await (await handler(request(at(ALMADEN), { token: 'jwt' }))).json();
    assertEquals(body.already_checked_in, true);
    assertEquals(body.stars_earned, 0);
    assertEquals(body.total_stars, 2);
    assertEquals(api.calls('PATCH profiles').length, 0);
  } finally {
    done();
  }
});

Deno.test('check-in: too far reports the nearest warehouse and distance', async () => {
  const { done } = setup();
  try {
    const res = await handler(request({ latitude: 37.3, longitude: -121.86 }, { token: 'jwt' }));
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, 'too_far');
    assertEquals(body.nearest_warehouse.name, 'Almaden');
    assertEquals(body.distance_metres > 5000, true);
  } finally {
    done();
  }
});

Deno.test('check-in: input and auth validation', async () => {
  const { done } = setup();
  try {
    assertEquals((await handler(request({}, { token: 'jwt' }))).status, 400);
    assertEquals(
      (await handler(request({ latitude: '37', longitude: -121 }, { token: 'jwt' }))).status,
      400,
    );
  } finally {
    done();
  }
  const unauth = setup({ 'GET auth/user': errorResponse(401, { message: 'bad jwt' }) });
  try {
    const res = await handler(request(at(ALMADEN), { token: 'bad' }));
    assertEquals(res.status, 401);
    await res.body?.cancel();
  } finally {
    unauth.done();
  }
});

Deno.test('check-in: no warehouses or no coordinates is a server error', async () => {
  for (const warehouses of [[], [{ ...ALMADEN, latitude: null, longitude: null }]]) {
    const { done } = setup({ 'GET warehouses': warehouses });
    try {
      const res = await handler(request(at(ALMADEN), { token: 'jwt' }));
      assertEquals(res.status, 500);
      await res.body?.cancel();
    } finally {
      done();
    }
  }
});

Deno.test('check-in: a failed insert is reported', async () => {
  const { done } = setup({
    'POST check_ins': errorResponse(500, { code: '500', message: 'disk full' }),
  });
  try {
    const logged: unknown[] = [];
    const error = console.error;
    console.error = (...args: unknown[]) => logged.push(args.join(' '));
    let res: Response;
    try {
      res = await handler(request(at(ALMADEN), { token: 'jwt' }));
    } finally {
      console.error = error;
    }
    assertEquals(res.status, 500);
    // Generic message to the client; the database detail only in the log.
    assertEquals((await res.json()).error, 'Could not record the check-in. Please try again.');
    assertEquals(
      logged.some((l) => String(l).includes('disk full')),
      true,
    );
  } finally {
    done();
  }
});

Deno.test(
  'check-in from a receipt: links the warehouse and dates the visit to the receipt',
  async () => {
    const { api, done } = setup({
      'GET receipts': {
        id: 'r1',
        user_id: 'user-1',
        warehouse_id: null,
        transaction_date: '2026-08-11',
      },
      'PATCH receipts': null,
      'GET warehouses': { id: 'w1', name: 'Almaden', city: 'San Jose', tier: 'Common' },
    });
    try {
      const res = await handler(
        request({ receipt_id: 'r1', warehouse_id: 'w1' }, { token: 'jwt' }),
      );
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.warehouse.name, 'Almaden');
      assertEquals(body.already_checked_in, false);
      assertEquals(api.calls('PATCH receipts')[0].body, { warehouse_id: 'w1' });
      assertEquals(
        (api.calls('POST check_ins')[0].body as { checked_in_at: string }).checked_in_at,
        '2026-08-11T12:00:00Z',
      );
    } finally {
      done();
    }
  },
);

Deno.test('check-in from a receipt: validation', async () => {
  const cases: [Record<string, unknown>, Record<string, unknown>, number][] = [
    [{ receipt_id: 'r1' }, {}, 400], // no warehouse_id
    [
      { receipt_id: 'r1', warehouse_id: 'w1' },
      { 'GET receipts': errorResponse(406, { code: 'PGRST116', message: '0 rows' }) },
      404,
    ],
    [
      { receipt_id: 'r1', warehouse_id: 'w1' },
      { 'GET receipts': { id: 'r1', user_id: 'someone-else', warehouse_id: null } },
      404,
    ],
    [
      { receipt_id: 'r1', warehouse_id: 'w1' },
      { 'GET receipts': { id: 'r1', user_id: 'user-1', warehouse_id: 'w9' } },
      409,
    ],
    [
      { receipt_id: 'r1', warehouse_id: 'w1' },
      {
        'GET receipts': { id: 'r1', user_id: 'user-1', warehouse_id: null },
        'GET warehouses': errorResponse(406, { code: 'PGRST116', message: '0 rows' }),
      },
      404,
    ],
  ];
  for (const [body, routes, status] of cases) {
    const { done } = setup(routes);
    try {
      const res = await handler(request(body, { token: 'jwt' }));
      assertEquals(
        res.status,
        status,
        JSON.stringify(body) + ' ' + JSON.stringify(Object.keys(routes)),
      );
      await res.body?.cancel();
    } finally {
      done();
    }
  }
});

Deno.test('check-in: answers CORS preflight', async () => {
  const res = await handler(request(null, { method: 'OPTIONS' }));
  assertEquals(res.status, 200);
  await res.body?.cancel();
});
