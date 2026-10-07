import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { handler } from './handler.ts';
import {
  type Call,
  errorResponse,
  fakeSupabase,
  quiet,
  request,
  setFunctionEnv,
  settle,
} from '../_testing/fakeSupabase.ts';

const VISION = 'POST https://vision.googleapis.com/v1/images:annotate';
const USER_ID = 'user-1';
const IMAGE = `${USER_ID}/1.jpg`;

const OCR = [
  'COSTCO WHOLESALE',
  'Almaden #470',
  '5301 Almaden Expressway',
  'San Jose, CA 95118',
  '59 Member 112051125767',
  '1518783 CUCNT WIN 12.99',
  '1518783 CUCNT WIN 12.99',
  '7812 YELLOW ONION 2.49',
  'SUBTOTAL 28.47',
  'CA TAX 0.00',
  '**** TOTAL 28.47',
  'TOTAL NUMBER OF ITEMS SOLD = 3',
  '08/11/2026 14:32',
  'TC# 1234-5678-9012',
].join('\n');

const vision = (text: string | null) => ({
  responses: [{ fullTextAnnotation: text == null ? undefined : { text } }],
});

function setup(routes: Record<string, unknown> = {}, ocr: string | null = OCR) {
  const cleanup = setFunctionEnv({ GOOGLE_CLOUD_VISION_API_KEY: 'vision-key' });
  const api = fakeSupabase({
    'GET storage/receipts': () => new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200 }),
    'DELETE storage/receipts': [],
    [VISION]: vision(ocr),
    'GET warehouses': (c: Call) =>
      c.params.get('warehouse_code') === 'eq.470'
        ? { id: 'w-470' }
        : c.params.get('id') === 'eq.w-470'
          ? { name: 'Almaden', tier: 'Common' }
          : [],
    'GET receipts': [],
    'POST receipts': { id: 'r-new' },
    'POST products': (c: Call) => ({ id: `p-${(c.body as { sku: string }).sku}` }),
    'POST receipt_items': null,
    // Check-in award for the receipt's warehouse
    'POST check_ins': null,
    'GET profiles': { total_stars: 0, fan_tier: 'KirklandCadet' },
    'PATCH profiles': null,
    'HEAD check_ins': 1,
    'GET check_ins': [{ warehouse_id: 'w-470' }],
    'GET user_badges': [],
    'GET badges': [],
    // Fire-and-forget price check
    'POST functions/price-match-check': { checked: 2 },
    // The signed-in caller (the receipt's owner)
    'GET auth/user': { id: USER_ID, aud: 'authenticated' },
    ...routes,
  });
  return { api, done: async () => (await settle(), api.restore(), cleanup()) };
}

const ingest = (body: unknown = { imagePath: IMAGE, userId: USER_ID }, token = 'jwt') =>
  quiet(() => handler(request(body, { token })));

Deno.test('ingest-receipt: OCRs, parses and stores the receipt, items and visit', async () => {
  const { api, done } = setup();
  try {
    const res = await ingest();
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.receiptId, 'r-new');
    assertEquals(body.itemCount, 3);
    assertEquals(body.itemCountMismatch, false);
    assertEquals(body.subtotal, 28.47);
    assertEquals(body.duplicate, false);
    assertEquals(body.checkIn.warehouseName, 'Almaden');
    assertEquals(body.checkIn.totalStars, 1);

    const vision = api.calls(VISION)[0];
    assertEquals(vision.params.get('key'), 'vision-key');
    assertEquals(
      (vision.body as { requests: { image: { content: string } }[] }).requests[0].image.content,
      '/9j/',
    );

    const receipt = api.calls('POST receipts')[0].body as Record<string, unknown>;
    assertEquals(receipt.warehouse_id, 'w-470');
    assertEquals(receipt.transaction_date, '2026-08-11');
    assertEquals(receipt.transaction_number, '123456789012');
    assertEquals(receipt.total_amount, 28.47);
    assertEquals(receipt.image_path, IMAGE);

    const items = api.calls('POST receipt_items').map((c) => c.body as Record<string, unknown>);
    assertEquals(
      items.map((i) => [i.sku, i.quantity, i.product_id]),
      [
        ['1518783', 2, 'p-1518783'],
        ['7812', 1, 'p-7812'],
      ],
    );
    // The visit is dated to the receipt, not to today.
    assertEquals(
      (api.calls('POST check_ins')[0].body as { checked_in_at: string }).checked_in_at,
      '2026-08-11T12:00:00Z',
    );

    await settle();
    assertEquals(api.calls('POST functions/price-match-check')[0].body, {
      receipt_id: 'r-new',
      user_id: USER_ID,
    });
  } finally {
    await done();
  }
});

Deno.test(
  'ingest-receipt: a re-scanned receipt returns the existing one and deletes the new image',
  async () => {
    const { api, done } = setup({ 'GET receipts': { id: 'r-existing' } });
    try {
      const body = await (await ingest()).json();
      assertEquals(body, { receiptId: 'r-existing', itemCount: 0, duplicate: true });
      assertEquals(api.calls('DELETE storage/receipts')[0].body, { prefixes: [IMAGE] });
      assertEquals(api.calls('POST receipts').length, 0);
    } finally {
      await done();
    }
  },
);

Deno.test(
  'ingest-receipt: matches a Google Places–seeded warehouse by city and backfills its code',
  async () => {
    const { api, done } = setup({
      'GET warehouses': (c: Call) =>
        c.params.get('warehouse_code') === 'like.GP-%'
          ? [
              { id: 'w-gp1', warehouse_code: 'GP-000001', city: 'San Jose', postal_code: '95118' },
              { id: 'w-gp2', warehouse_code: 'GP-000002', city: 'San Jose', postal_code: '95125' },
              { id: 'w-gp3', warehouse_code: 'GP-000003', city: 'Fresno', postal_code: '93711' },
            ]
          : c.params.get('id')
            ? { name: 'Almaden', tier: 'Common' }
            : [],
      'PATCH warehouses': null,
    });
    try {
      await ingest();
      // Two San Jose warehouses — the postal code on the receipt picks one.
      assertEquals(
        (api.calls('POST receipts')[0].body as { warehouse_id: string }).warehouse_id,
        'w-gp1',
      );
      const [patch] = api.calls('PATCH warehouses');
      assertEquals(patch.body, { warehouse_code: '470' });
      assertEquals(patch.params.get('id'), 'eq.w-gp1');
    } finally {
      await done();
    }
  },
);

Deno.test(
  'ingest-receipt: an unmatched warehouse is saved without one (and no visit)',
  async () => {
    const { api, done } = setup({ 'GET warehouses': [] });
    try {
      const body = await (await ingest()).json();
      assertEquals(body.checkIn, null);
      assertEquals(
        (api.calls('POST receipts')[0].body as { warehouse_id: unknown }).warehouse_id,
        null,
      );
      assertEquals(api.calls('POST check_ins').length, 0);
    } finally {
      await done();
    }
  },
);

Deno.test('ingest-receipt: unreadable receipts are rejected with a reason', async () => {
  const cases: [string | null, number, string][] = [
    ['59 Member 1\n1061247 KIRKLAND PARM 12.99\nSUBTOTAL 12.99', 422, 'transaction date'],
    ['08/11/2026\nThank you for shopping', 422, 'No line items'],
    [null, 500, 'No text detected'],
  ];
  for (const [ocr, status, message] of cases) {
    const { done } = setup({}, ocr);
    try {
      const res = await ingest();
      assertEquals(res.status, status);
      assertStringIncludes((await res.json()).error, message);
    } finally {
      await done();
    }
  }
});

Deno.test('ingest-receipt: request, download and insert failures', async () => {
  const missing = setup();
  try {
    assertEquals((await ingest({ userId: USER_ID })).status, 400);
  } finally {
    await missing.done();
  }

  const download = setup({
    'GET storage/receipts': errorResponse(404, { message: 'Object not found' }),
  });
  try {
    const res = await ingest();
    assertEquals(res.status, 400);
    assertStringIncludes((await res.json()).error, 'Failed to download image');
  } finally {
    await download.done();
  }

  const insert = setup({
    'POST receipts': errorResponse(500, { message: 'violates foreign key' }),
  });
  try {
    const res = await ingest();
    assertEquals(res.status, 500);
    assertEquals((await res.json()).error, 'violates foreign key');
  } finally {
    await insert.done();
  }

  const pre = await handler(request(null, { method: 'OPTIONS' }));
  assertEquals(pre.status, 200);
  await pre.body?.cancel();
});

Deno.test('ingest-receipt: only the signed-in owner of the image can ingest it', async () => {
  const { api, done } = setup();
  try {
    // No token (the public anon key resolves to no user)
    assertEquals((await ingest(undefined, '')).status, 401);
    // userId in the body must be the caller's
    assertEquals((await ingest({ imagePath: IMAGE, userId: 'someone-else' })).status, 403);
    // and so must the image
    assertEquals((await ingest({ imagePath: 'someone-else/1.jpg' })).status, 403);
    // Nothing was read or OCR'd
    assertEquals(api.calls('GET storage/receipts').length, 0);
    assertEquals(api.calls(VISION).length, 0);
  } finally {
    await done();
  }

  const anon = setup({ 'GET auth/user': errorResponse(401) });
  try {
    assertEquals((await ingest(undefined, 'anon-key')).status, 401);
    assertEquals(anon.api.calls(VISION).length, 0);
  } finally {
    await anon.done();
  }

  // Older app builds send userId too; without it the caller still owns the receipt.
  const noUserId = setup();
  try {
    assertEquals((await ingest({ imagePath: IMAGE })).status, 200);
  } finally {
    await noUserId.done();
  }
});
