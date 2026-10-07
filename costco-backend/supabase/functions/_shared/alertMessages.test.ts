import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { ALERTS_URL, buildPriceDropEmail, buildWeeklySms, formatUsd } from './alertMessages.ts';

Deno.test('formatUsd always shows two decimals', () => {
  assertEquals(formatUsd(3), '$3.00');
  assertEquals(formatUsd(12.5), '$12.50');
  assertEquals(formatUsd(0.3), '$0.30');
});

Deno.test('weekly SMS: singular/plural, link, STOP line, single segment', () => {
  const one = buildWeeklySms(1, 4);
  assertStringIncludes(one, '1 price drop on');
  assertStringIncludes(one, '$4.00 back');
  assertStringIncludes(one, ALERTS_URL);
  assertStringIncludes(one, 'Reply STOP to opt out');

  const many = buildWeeklySms(3, 27.5);
  assertStringIncludes(many, '3 price drops');
  assert(many.length <= 160, `SMS is ${many.length} chars`);
  // GSM-7 safety: plain ASCII only, so it can't switch to 70-char UCS-2.
  assert(/^[\x20-\x7E]*$/.test(many), 'SMS must be plain ASCII');
});

Deno.test('weekly SMS falls back to a short message instead of exceeding 160 chars', () => {
  const sms = buildWeeklySms(1e20, 1e30);
  assert(sms.length <= 160, `SMS is ${sms.length} chars`);
  assertStringIncludes(sms, 'Reply STOP to opt out');
});

Deno.test('price-drop email: subject, item count, links in both parts', () => {
  const unsub = 'https://example.supabase.co/functions/v1/email-unsubscribe?u=abc&t=def';
  const one = buildPriceDropEmail(1, 3, unsub);
  assertEquals(one.subject, 'Price drop: you could get $3.00 back');
  assertStringIncludes(one.text, 'on 1 item you bought');

  const many = buildPriceDropEmail(2, 15.25, unsub);
  assertStringIncludes(many.text, 'on 2 items you bought');
  for (const part of [many.html, many.text]) {
    assertStringIncludes(part, ALERTS_URL);
    assertStringIncludes(part, unsub);
    assertStringIncludes(part, '$15.25');
  }
  assertStringIncludes(many.text, 'not affiliated with Costco');
});
