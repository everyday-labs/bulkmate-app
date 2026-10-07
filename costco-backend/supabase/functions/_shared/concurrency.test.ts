import { assertEquals } from 'jsr:@std/assert@1';
import { mapWithConcurrency } from './concurrency.ts';

const tick = () => new Promise((r) => setTimeout(r, 1));

Deno.test('mapWithConcurrency: keeps input order', async () => {
  const out = await mapWithConcurrency([3, 1, 2], 2, async (n) => {
    await new Promise((r) => setTimeout(r, n));
    return n * 10;
  });
  assertEquals(out, [30, 10, 20]);
});

Deno.test('mapWithConcurrency: never exceeds the limit', async () => {
  let inFlight = 0;
  let peak = 0;
  await mapWithConcurrency([...Array(20).keys()], 4, async () => {
    peak = Math.max(peak, ++inFlight);
    await tick();
    inFlight--;
  });
  assertEquals(peak, 4);
});

Deno.test('mapWithConcurrency: stops starting new work, leaves the rest undefined', async () => {
  let started = 0;
  const out = await mapWithConcurrency([1, 2, 3, 4, 5], 1, async (n) => {
    started++;
    await tick();
    return n;
  }, () => started >= 2);
  assertEquals(out, [1, 2, undefined, undefined, undefined]);
});

Deno.test('mapWithConcurrency: empty input', async () => {
  assertEquals(await mapWithConcurrency([], 4, () => Promise.resolve(1)), []);
});
