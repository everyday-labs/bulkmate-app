import { assertEquals } from 'jsr:@std/assert@1';
import { tierForStars } from './checkInRewards.ts';

Deno.test('fan tier thresholds', () => {
  const cases: [number, string][] = [
    [0, 'KirklandCadet'],
    [1, 'KirklandCadet'],
    [2, 'KirklandCadet'],
    [3, 'WholesaleWanderer'],
    [5, 'WholesaleWanderer'],
    [6, 'BulkBuyer'],
    [10, 'BulkBuyer'],
    [11, 'GoldStarGuru'],
    [20, 'GoldStarGuru'],
    [21, 'ExecutiveExplorer'],
    [500, 'ExecutiveExplorer'],
  ];
  for (const [stars, tier] of cases) assertEquals(tierForStars(stars), tier, `${stars} stars`);
});
