import { assertEquals } from 'jsr:@std/assert@1';
import { handler } from './handler.ts';
import {
  errorResponse,
  fakeSupabase,
  quiet,
  request,
  setFunctionEnv,
  settle,
} from '../_testing/fakeSupabase.ts';

const SKU = '0096619756803';
const RAPIDAPI = 'GET https://costco-live-data.p.rapidapi.com/search';
const OFF = `GET https://world.openfoodfacts.org/api/v2/product/${SKU}.json`;
const FDC = 'GET https://api.nal.usda.gov/fdc/v1/foods/search';
const USER = { id: 'user-1', email: 'sam@example.com', aud: 'authenticated' };

const rapidProduct = {
  item_number: SKU,
  name: 'Kirkland Signature Olive Oil',
  item_location_pricing_salePrice: 18.99,
  item_location_pricing_listPrice: 22.99,
  item_warehouse_onlinePrice: 24.99,
  Brand_attr: ['Kirkland Signature'],
  item_program_eligibility: ['InWarehouse'],
  review_rating: 4.8,
};
const offProduct = {
  status: 1,
  product: {
    product_name: 'Extra Virgin Olive Oil',
    brands: 'Kirkland',
    ingredients_text: 'Extra virgin olive oil, BHT',
    nova_group: 2,
    nutriscore_grade: 'b',
    additives_tags: ['en:e321'],
    nutrient_levels_tags: ['en:fat-in-high-quantity'],
    ingredients_analysis_tags: ['en:palm-oil-free'],
  },
};

function setup(
  routes: Record<string, unknown> = {},
  env: Record<string, string> = { RAPIDAPI_KEY: 'k', USDA_FDC_API_KEY: 'f' },
) {
  const cleanup = setFunctionEnv(env);
  const api = fakeSupabase({
    'GET products': [],
    'POST products': null,
    'GET receipt_items': [
      { unit_price: 19.99, discount_amount: 1, transaction_date: '2026-10-01' },
      { unit_price: 17.99, discount_amount: null, transaction_date: '2026-09-01' },
    ],
    [RAPIDAPI]: { products: [rapidProduct] },
    [OFF]: offProduct,
    [FDC]: { foods: [] },
    'GET auth/user': USER,
    'POST product_lookups': null,
    ...routes,
  });
  return { api, done: async () => (await settle(), api.restore(), cleanup()) };
}

const lookup = (sku: unknown = SKU, token = 'jwt') =>
  quiet(() => handler(request({ sku }, { token })));

Deno.test(
  'barcode-lookup: live lookup returns prices, receipt history and ingredients',
  async () => {
    const { api, done } = setup();
    try {
      const res = await lookup();
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.source, 'rapidapi');
      assertEquals(body.sale_price, 18.99);
      assertEquals(body.savings_amount, 4);
      assertEquals(body.in_warehouse, true);
      assertEquals(body.ocr_history, {
        count: 2,
        min_price: 17.99,
        max_price: 18.99,
        avg_price: 18.49,
        last_seen: '2026-10-01',
      });
      assertEquals(body.ingredients.source, 'off');
      assertEquals(body.ingredients.novaGroup, 2);
      assertEquals(
        body.ingredients.items.find((i: { name: string }) => i.name === 'BHT').flag,
        'avoid',
      );
      assertEquals(
        body.ingredients.productFlags.map((f: { key: string }) => f.key),
        ['nutrient-fat-in-high-quantity'],
      );

      // Prices and ingredients are cached; the lookup is recorded for the caller.
      const upserts = api.calls('POST products').map((c) => c.body as Record<string, unknown>);
      assertEquals(
        upserts.some((u) => u.ingredients_source === 'off'),
        true,
      );
      assertEquals(
        upserts.some((u) => u.api_sale_price === 18.99),
        true,
      );
      await settle();
      const [recorded] = api.calls('POST product_lookups');
      assertEquals((recorded.body as { user_id: string }).user_id, 'user-1');
    } finally {
      await done();
    }
  },
);

Deno.test('barcode-lookup: a fresh cache answers without calling any external API', async () => {
  const fresh = new Date().toISOString();
  const { api, done } = setup({
    'GET products': {
      sku: SKU,
      name: 'Olive Oil',
      brand: 'Kirkland',
      api_sale_price: '18.99',
      api_list_price: '22.99',
      api_online_price: null,
      api_price_updated_at: fresh,
      rating: '4.8',
      ingredients_text: 'Olive oil',
      ingredients_json: {
        items: [{ name: 'Olive oil', flag: 'good', reason: null }],
        productFlags: [],
      },
      ingredients_source: 'off',
      ingredients_updated_at: fresh,
      nova_group: 1,
      nutriscore_grade: 'a',
    },
  });
  try {
    const body = await (await lookup()).json();
    assertEquals(body.source, 'cache');
    assertEquals(body.savings_amount, 4);
    assertEquals(body.ingredients.tally, { good: 1, watch: 0, avoid: 0 });
    assertEquals(api.calls(RAPIDAPI).length, 0);
    assertEquals(api.calls(OFF).length, 0);
  } finally {
    await done();
  }
});

Deno.test('barcode-lookup: an old-format ingredients cache is refetched', async () => {
  const fresh = new Date().toISOString();
  const { api, done } = setup({
    'GET products': {
      sku: SKU,
      ingredients_json: [{ name: 'x', flag: 'good' }],
      ingredients_source: 'off',
      ingredients_updated_at: fresh,
    },
  });
  try {
    await lookup();
    assertEquals(api.calls(OFF).length, 1);
  } finally {
    await done();
  }
});

Deno.test('barcode-lookup: falls back to USDA ingredients, then to partial data', async () => {
  const { done } = setup({
    [RAPIDAPI]: { products: [] },
    [OFF]: { status: 0 },
    [FDC]: {
      foods: [
        {
          gtinUpc: SKU,
          description: 'OLIVE OIL',
          brandOwner: 'Costco',
          ingredients: 'OLIVE OIL, HIGH FRUCTOSE CORN SYRUP',
        },
      ],
    },
  });
  try {
    const body = await (await lookup()).json();
    assertEquals(body.source, 'partial');
    assertEquals(body.sale_price, null);
    assertEquals(body.ingredients.source, 'fdc');
    assertEquals(body.ingredients.tally, { good: 1, watch: 0, avoid: 1 });
  } finally {
    await done();
  }
});

Deno.test('barcode-lookup: nothing anywhere is a 404 and caches the miss', async () => {
  const { api, done } = setup({
    [RAPIDAPI]: { products: [] },
    [OFF]: errorResponse(404),
    [FDC]: { foods: [] },
    'GET receipt_items': [],
  });
  try {
    const res = await lookup();
    assertEquals(res.status, 404);
    await res.body?.cancel();
    const miss = api.calls('POST products').map((c) => c.body as Record<string, unknown>);
    assertEquals(
      miss.some((u) => u.ingredients_source === 'none'),
      true,
    );
  } finally {
    await done();
  }
});

Deno.test('barcode-lookup: works without API keys and without a signed-in user', async () => {
  const { api, done } = setup({ 'GET auth/user': errorResponse(401) }, {});
  try {
    const body = await (await lookup(SKU, '')).json();
    assertEquals(body.source, 'partial'); // OFF needs no key; receipt history exists
    assertEquals(api.calls(RAPIDAPI).length, 0);
    assertEquals(api.calls(FDC).length, 0);
    await settle();
    assertEquals(api.calls('POST product_lookups').length, 0);
  } finally {
    await done();
  }
});

Deno.test('barcode-lookup: validation and failures', async () => {
  const { done } = setup();
  try {
    assertEquals((await lookup('  ')).status, 400);
    // A malformed body is the one failure that escapes to the 500 handler —
    // database/API errors degrade to cache misses instead.
    const bad = new Request('https://fn.local/', { method: 'POST', body: '{not json' });
    const res = await quiet(() => handler(bad));
    assertEquals(res.status, 500);
    await res.body?.cancel();
  } finally {
    await done();
  }
  const pre = await handler(request(null, { method: 'OPTIONS' }));
  assertEquals(pre.status, 200);
  await pre.body?.cancel();
});
