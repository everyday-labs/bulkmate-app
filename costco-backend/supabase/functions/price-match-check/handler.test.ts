import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { handler } from './handler.ts';
import {
  type Call,
  errorResponse,
  fakeSupabase,
  quiet,
  request,
  setFunctionEnv,
} from '../_testing/fakeSupabase.ts';

const RAPIDAPI = 'GET https://costco-live-data.p.rapidapi.com/search';
const PUSH = 'POST https://exp.host/--/api/v2/push/send';
const EMAIL = 'POST https://api.brevo.com/v3/smtp/email';
const USER_ID = '6f1c2a3b-0000-4000-8000-000000000001';

const receiptItems = [
  {
    id: 'i1',
    sku: '1518783',
    description: 'KS COCONUT WATER',
    unit_price: 12.99,
    discount_amount: 0,
  },
  { id: 'i2', sku: '7812', description: 'YELLOW ONION', unit_price: 2.49, discount_amount: null },
];
const rapid = (salePrice: number | null) => ({
  products:
    salePrice == null
      ? []
      : [
          {
            item_location_pricing_salePrice: salePrice,
            item_location_pricing_listPrice: 14.99,
            Brand_attr: ['Kirkland'],
          },
        ],
});

function setup(routes: Record<string, unknown> = {}, env: Record<string, string> = {}) {
  const cleanup = setFunctionEnv({ RAPIDAPI_KEY: 'rapid-key', BREVO_API_KEY: 'brevo-key', ...env });
  const api = fakeSupabase({
    // Receipt mode lists the receipt's items; the price ledger queries by SKU.
    'GET receipt_items': (c: Call) => (c.params.has('receipt_id') ? receiptItems : []),
    'GET products': [],
    'PATCH products': null,
    // Coconut water dropped to $9.99; onions unchanged.
    [RAPIDAPI]: (c: Call) => rapid(c.params.get('query') === '1518783' ? 9.99 : 2.49),
    'GET price_alerts': [],
    'POST price_alerts': (c: Call) => ({
      id: `alert-${(c.body as { receipt_item_id: string }).receipt_item_id}`,
    }),
    'PATCH price_alerts': null,
    'GET profiles': { push_token: 'ExponentPushToken[abc]', email_alerts_enabled: true },
    'GET auth/admin/users': { id: USER_ID, email: 'sam@example.com' },
    [PUSH]: { data: [{ status: 'ok' }] },
    [EMAIL]: { messageId: 'm1' },
    ...routes,
  });
  return { api, done: () => (api.restore(), cleanup()) };
}

const run = (body: unknown) => quiet(() => handler(request(body)));

Deno.test(
  'price-match-check: a drop after purchase creates an alert, a push and one email',
  async () => {
    const { api, done } = setup();
    try {
      const res = await run({ receipt_id: 'r1', user_id: USER_ID });
      assertEquals(await res.json(), {
        checked: 2,
        alerts_created: 1,
        pushes_sent: 1,
        emails_sent: 1,
        no_data: 0,
      });

      const [alert] = api.calls('POST price_alerts');
      const row = alert.body as Record<string, unknown>;
      assertEquals(row.receipt_item_id, 'i1');
      assertEquals(row.paid_price, 12.99);
      assertEquals(row.current_price, 9.99);
      assertEquals(Math.round((row.delta as number) * 100), 300);
      assertEquals(row.notified_at, null); // a new drop re-arms notifications
      assertEquals(alert.params.get('on_conflict'), 'receipt_item_id');

      const push = (api.calls(PUSH)[0].body as { title: string; data: { receiptId: string } }[])[0];
      assertEquals(push.title, 'Price Drop — You may be owed $3.00');
      assertEquals(push.data.receiptId, 'r1');

      const email = api.calls(EMAIL)[0].body as {
        to: { email: string }[];
        subject: string;
        headers: Record<string, string>;
      };
      assertEquals(email.to, [{ email: 'sam@example.com' }]);
      assertEquals(email.subject, 'Price drop: you could get $3.00 back');
      assertStringIncludes(email.headers['List-Unsubscribe'], 'email-unsubscribe');
      assertEquals(email.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');

      // Both notifications are recorded so they aren't sent again.
      const marks = api.calls('PATCH price_alerts').map((c) => Object.keys(c.body as object)[0]);
      assertEquals(marks.sort(), ['emailed_at', 'notified_at']);
    } finally {
      done();
    }
  },
);

Deno.test('price-match-check: the same drop does not notify twice', async () => {
  const { api, done } = setup({ 'GET price_alerts': { delta: '3.00' } });
  try {
    const res = await run({ receipt_id: 'r1', user_id: USER_ID });
    assertEquals((await res.json()).alerts_created, 0);
    assertEquals(api.calls(PUSH).length, 0);
    assertEquals(api.calls(EMAIL).length, 0);
    // The row is refreshed without re-arming notified_at.
    assertEquals('notified_at' in (api.calls('POST price_alerts')[0].body as object), false);
  } finally {
    done();
  }
});

Deno.test('price-match-check: a deeper drop notifies again', async () => {
  const { api, done } = setup({ 'GET price_alerts': { delta: '1.00' } });
  try {
    assertEquals(
      (await (await run({ receipt_id: 'r1', user_id: USER_ID })).json()).alerts_created,
      1,
    );
    assertEquals(api.calls(PUSH).length, 1);
  } finally {
    done();
  }
});

Deno.test('price-match-check: respects notification preferences', async () => {
  const { api, done } = setup({
    'GET profiles': { push_token: null, email_alerts_enabled: false },
  });
  try {
    const body = await (await run({ receipt_id: 'r1', user_id: USER_ID })).json();
    assertEquals(body.alerts_created, 1);
    assertEquals(body.pushes_sent, 0);
    assertEquals(body.emails_sent, 0);
    assertEquals(api.calls(EMAIL).length, 0);
  } finally {
    done();
  }
});

Deno.test('price-match-check: uses a fresh cached price instead of calling RapidAPI', async () => {
  const fresh = new Date().toISOString();
  const { api, done } = setup({
    'GET products': {
      api_sale_price: '9.99',
      api_price_updated_at: fresh,
      lowest_api_price: '9.99',
      lowest_receipt_price: '12.99',
    },
  });
  try {
    // The cached $9.99 is a drop for the $12.99 coconut water, not the $2.49 onions.
    assertEquals(
      (await (await run({ receipt_id: 'r1', user_id: USER_ID })).json()).alerts_created,
      1,
    );
    assertEquals(api.calls(RAPIDAPI).length, 0);
  } finally {
    done();
  }
});

Deno.test('price-match-check: the receipt ledger median can beat the API price', async () => {
  // Five recent receipts for coconut water, median net $10.49; API says $11.99.
  const ledger = [12.99, 10.49, 10.49, 9.99, 11.49].map((p) => ({
    unit_price: p,
    discount_amount: 0,
  }));
  const { api, done } = setup({
    'GET receipt_items': (c: Call) =>
      c.params.has('receipt_id')
        ? [receiptItems[0]]
        : c.params.get('sku') === 'eq.1518783'
          ? ledger
          : [],
    [RAPIDAPI]: rapid(11.99),
  });
  try {
    await run({ receipt_id: 'r1', user_id: USER_ID });
    const row = api.calls('POST price_alerts')[0].body as Record<string, unknown>;
    assertEquals(row.current_price, 10.49);
    assertEquals(row.source, 'ocr_ledger');
    const update = api.calls('PATCH products').at(-1)!.body as Record<string, unknown>;
    assertEquals(update.lowest_receipt_price, 10.49);
    assertEquals(update.brand, 'Kirkland');
  } finally {
    done();
  }
});

Deno.test('price-match-check: items with no price data are counted, not alerted', async () => {
  const { api, done } = setup({ [RAPIDAPI]: rapid(null) });
  try {
    const body = await (await run({ receipt_id: 'r1', user_id: USER_ID })).json();
    assertEquals(body.no_data, 2);
    assertEquals(api.calls('POST price_alerts').length, 0);
  } finally {
    done();
  }
});

Deno.test('price-match-check: the daily sweep checks every recent item for its owner', async () => {
  const { api, done } = setup({
    'GET receipt_items': (c: Call) =>
      c.params.has('sku')
        ? []
        : [
            { ...receiptItems[0], receipt_id: 'r1', receipts: { user_id: USER_ID } },
            { ...receiptItems[1], receipt_id: 'r2', receipts: null }, // orphan: skipped
          ],
  });
  try {
    const body = await (await run({ sweep: true })).json();
    assertEquals(body.checked, 1);
    assertEquals(body.alerts_created, 1);
    assertEquals((api.calls('POST price_alerts')[0].body as { user_id: string }).user_id, USER_ID);
  } finally {
    done();
  }
});

Deno.test('price-match-check: input validation and failures', async () => {
  const { done } = setup();
  try {
    assertEquals((await run({})).status, 400);
  } finally {
    done();
  }
  const failing = setup({ 'GET receipt_items': errorResponse(500, { message: 'db down' }) });
  try {
    assertEquals((await run({ receipt_id: 'r1', user_id: USER_ID })).status, 500);
  } finally {
    failing.done();
  }
  const upsertFails = setup({ 'POST price_alerts': errorResponse(500, { message: 'conflict' }) });
  try {
    const body = await (await run({ receipt_id: 'r1', user_id: USER_ID })).json();
    assertEquals(body.alerts_created, 0);
  } finally {
    upsertFails.done();
  }
  const pre = await handler(request(null, { method: 'OPTIONS' }));
  assertEquals(pre.status, 200);
  await pre.body?.cancel();
});
