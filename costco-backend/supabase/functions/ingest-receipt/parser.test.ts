// Regression suite for the receipt parser. Each case is a layout or bug
// documented in costco-backend/PARSER_DECISIONS.md — when a new real receipt
// breaks the parser, add its shape here before fixing it.
//
// Run: deno test costco-backend/supabase/functions

import { assertEquals } from 'jsr:@std/assert@1';
import { parseReceiptText, type ParsedItem } from './parser.ts';

const receipt = (...lines: string[]) => lines.join('\n');

const item = (
  sku: string,
  description: string,
  unitPrice: number,
  extra: Partial<ParsedItem> = {},
): ParsedItem => ({
  sku,
  description,
  unitPrice,
  discountAmount: 0,
  quantity: 1,
  ...extra,
});

Deno.test('header fields: warehouse, date, totals, item count, TC#', () => {
  const parsed = parseReceiptText(
    receipt(
      'COSTCO WHOLESALE',
      'Almaden #470',
      '5301 Almaden Expressway',
      '59 Member 112051125767',
      '1061247 KIRKLAND PARM 12.99 A',
      'SUBTOTAL 12.99',
      'CA TAX 1.14',
      '**** TOTAL 14.13',
      'TOTAL NUMBER OF ITEMS SOLD = 1',
      '08/11/2026 14:32',
      'TC# 1234-5678-9012',
    ),
  );
  assertEquals(parsed.warehouseCode, '470');
  assertEquals(parsed.transactionDate, '2026-08-11');
  assertEquals(parsed.transactionNumber, '123456789012');
  assertEquals(parsed.subtotal, 12.99);
  assertEquals(parsed.tax, 1.14);
  assertEquals(parsed.grandTotal, 14.13);
  assertEquals(parsed.expectedItemCount, 1);
  assertEquals(parsed.itemCountMismatch, false);
  assertEquals(parsed.items, [item('1061247', 'KIRKLAND PARM', 12.99)]);
});

Deno.test('amounts on the line after their label, with $ prefix', () => {
  const parsed = parseReceiptText(
    receipt(
      'Member 112051125767',
      '7812 YELLOW ONION 2.49',
      'SUBTOTAL',
      '$2.49',
      'TAX',
      '$0.00',
      '**** TOTAL',
      '$2.49',
    ),
  );
  assertEquals(parsed.subtotal, 2.49);
  assertEquals(parsed.tax, 0);
  assertEquals(parsed.grandTotal, 2.49);
});

Deno.test('date: two-digit year and day/month swap', () => {
  assertEquals(parseReceiptText('08/11/26').transactionDate, '2026-08-11');
  assertEquals(parseReceiptText('25/08/2026').transactionDate, '2026-08-25');
  assertEquals(parseReceiptText('no date here').transactionDate, null);
});

Deno.test('TC# split across two lines, and barcode digits after TOTAL', () => {
  assertEquals(
    parseReceiptText(receipt('TC#', '1234 5678 9012')).transactionNumber,
    '123456789012',
  );
  assertEquals(
    parseReceiptText(receipt('**** TOTAL 10.00', '21147000470123456')).transactionNumber,
    '21147000470123456',
  );
});

Deno.test('CRV barcode before the next item does not steal its price (2026-08-11)', () => {
  // Real column order from the Almaden #470 receipt: the deposit price comes
  // after the item price, and must be discarded rather than assigned.
  const { items } = parseReceiptText(
    receipt(
      'Member 112051125767',
      '0600000000 CA REDEMP V',
      '1518783 CUCNT WIN',
      '12.99',
      '0.30',
      'SUBTOTAL 12.99',
    ),
  );
  assertEquals(items, [item('1518783', 'CUCNT WIN', 12.99)]);
});

Deno.test('batched layout: all descriptions first, then all prices', () => {
  const { items } = parseReceiptText(
    receipt(
      'Member 112051125767',
      '1111111 FIRST ITEM',
      '2222222 SECOND ITEM',
      '3333333 THIRD ITEM',
      '1.11',
      '2.22 E',
      '3.33 A',
      'SUBTOTAL 6.66',
    ),
  );
  assertEquals(items, [
    item('1111111', 'FIRST ITEM', 1.11),
    item('2222222', 'SECOND ITEM', 2.22),
    item('3333333', 'THIRD ITEM', 3.33),
  ]);
});

Deno.test('partial-batch layout: two groups of descriptions and prices', () => {
  const { items } = parseReceiptText(
    receipt(
      'Member 112051125767',
      '1111111 FIRST ITEM',
      '2222222 SECOND ITEM',
      '1.11',
      '2.22',
      '3333333 THIRD ITEM',
      '3.33',
      'SUBTOTAL 6.66',
    ),
  );
  assertEquals(
    items.map((i) => [i.sku, i.unitPrice]),
    [
      ['1111111', 1.11],
      ['2222222', 2.22],
      ['3333333', 3.33],
    ],
  );
});

Deno.test('instant savings attach to the most recently priced item', () => {
  const { items } = parseReceiptText(
    receipt(
      'Member 112051125767',
      '1061247 KIRKLAND CHEESE 12.99 A', // inline price
      '2.00-',
      '7812 YELLOW ONION', // standalone price
      '4.49 E',
      '1.00-A',
      'SUBTOTAL 14.48',
    ),
  );
  assertEquals(items, [
    item('1061247', 'KIRKLAND CHEESE', 12.99, { discountAmount: 2 }),
    item('7812', 'YELLOW ONION', 4.49, { discountAmount: 1 }),
  ]);
});

Deno.test('multi-buy: same SKU and price merges into one row with quantity', () => {
  const parsed = parseReceiptText(
    receipt(
      'Member 112051125767',
      '1518783 CUCNT WIN 12.99',
      '1.00-',
      '1518783 KS COCNT TR 12.99', // same SKU, different OCR read of the name
      'SUBTOTAL 24.98',
      'TOTAL NUMBER OF ITEMS SOLD = 2',
    ),
  );
  assertEquals(parsed.items, [
    item('1518783', 'CUCNT WIN', 12.99, { quantity: 2, discountAmount: 1 }),
  ]);
  // Counts units, not rows — a multi-buy must not report a mismatch.
  assertEquals(parsed.itemCountMismatch, false);
});

Deno.test('same SKU at different prices stays as separate rows', () => {
  const { items } = parseReceiptText(
    receipt(
      'Member 112051125767',
      '1518783 CUCNT WIN 12.99',
      '1518783 CUCNT WIN 10.99',
      'SUBTOTAL 23.98',
    ),
  );
  assertEquals(items.length, 2);
});

Deno.test('item count mismatch is reported', () => {
  const parsed = parseReceiptText(
    receipt(
      'Member 112051125767',
      '1061247 KIRKLAND PARM 12.99',
      'SUBTOTAL 12.99',
      'TOTAL NUMBER OF ITEMS SOLD - 3',
    ),
  );
  assertEquals(parsed.expectedItemCount, 3);
  assertEquals(parsed.itemCountMismatch, true);
});

Deno.test('fuzzy Member line ("Nember") still finds the item section', () => {
  const { items } = parseReceiptText(
    receipt(
      'Almaden #470',
      '5301 Almaden Expressway',
      'OX Nember 111894060404',
      '1061247 KIRKLAND PARM 12.99',
      'SUBTOTAL 12.99',
    ),
  );
  assertEquals(items, [item('1061247', 'KIRKLAND PARM', 12.99)]);
});

Deno.test('no Member line: fallback skips the warehouse street address', () => {
  const { items } = parseReceiptText(
    receipt(
      'COSTCO WHOLESALE',
      '1601 Coleman Ave',
      '1061247 KIRKLAND PARM',
      '12.99',
      'SUBTOTAL 12.99',
    ),
  );
  assertEquals(items, [item('1061247', 'KIRKLAND PARM', 12.99)]);
});

Deno.test('3-digit SKU and space-separated leading letter are parsed', () => {
  const { items } = parseReceiptText(
    receipt(
      'Member 112051125767',
      '177 4LB ORG FUJI',
      'E 200303 PEELD GARLIC',
      '6.99',
      '4.49',
      'SUBTOTAL 11.48',
    ),
  );
  assertEquals(items, [item('177', '4LB ORG FUJI', 6.99), item('200303', 'PEELD GARLIC', 4.49)]);
});

Deno.test('trailing-price recovery: prices flushed after the TOTAL block', () => {
  // Observed on a real 17-item receipt: the last items' prices printed after
  // "TOTAL NUMBER OF ITEMS SOLD", interleaved with CRV deposits.
  const parsed = parseReceiptText(
    receipt(
      'Member 112051125767',
      '1061247 KIRKLAND PARM 12.99',
      '1518783 KS COCNT WTR',
      '1234567 SNAPWARE18PC',
      'SUBTOTAL 45.97',
      'TOTAL NUMBER OF ITEMS SOLD = 3',
      '12.99',
      '0.30',
      '24.99',
      '5.00-',
      '45.97',
    ),
  );
  assertEquals(parsed.items, [
    item('1061247', 'KIRKLAND PARM', 12.99),
    item('1518783', 'KS COCNT WTR', 12.99),
    item('1234567', 'SNAPWARE18PC', 24.99, { discountAmount: 5 }),
  ]);
});

Deno.test('empty or unrelated text yields no items', () => {
  const parsed = parseReceiptText('');
  assertEquals(parsed.items, []);
  assertEquals(parsed.subtotal, null);
  assertEquals(parsed.itemCountMismatch, false);
});
