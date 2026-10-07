import { assertEquals } from 'jsr:@std/assert@1';
import {
  classifyByKeyword,
  classifyFromOpenFoodFacts,
  splitIngredients,
} from './ingredientRules.ts';
import { lookupAdditive } from './additiveDatabase.ts';
import type { OffProduct } from './openFoodFacts.ts';

const off = (overrides: Partial<OffProduct>): OffProduct => ({
  name: null,
  brand: null,
  ingredientsText: null,
  novaGroup: null,
  nutriscoreGrade: null,
  additives: [],
  nutrientLevels: [],
  palmOil: 'unknown',
  ...overrides,
});

Deno.test('splitIngredients keeps parenthesised sub-ingredients together', () => {
  assertEquals(splitIngredients('ENRICHED FLOUR (WHEAT FLOUR, NIACIN, IRON), SUGAR, SALT'), [
    'ENRICHED FLOUR (WHEAT FLOUR, NIACIN, IRON)',
    'SUGAR',
    'SALT',
  ]);
  assertEquals(splitIngredients(' , WATER,, '), ['WATER']);
  assertEquals(splitIngredients(''), []);
});

Deno.test('lookupAdditive is case-insensitive and returns null for unknown codes', () => {
  assertEquals(lookupAdditive('E250')?.name, 'Sodium Nitrite');
  assertEquals(lookupAdditive('e250')?.flag, 'avoid');
  assertEquals(lookupAdditive('e999999'), null);
});

Deno.test('keyword fallback: avoid rules win over watch rules', () => {
  const { items, tally } = classifyByKeyword('WATER, HIGH FRUCTOSE CORN SYRUP, SUGAR, SALT');
  assertEquals(
    items.map((i) => [i.name, i.flag]),
    [
      ['WATER', 'good'],
      ['HIGH FRUCTOSE CORN SYRUP', 'avoid'], // also contains "CORN SYRUP" (watch)
      ['SUGAR', 'watch'],
      ['SALT', 'good'],
    ],
  );
  assertEquals(tally, { good: 2, watch: 1, avoid: 1 });
});

Deno.test('OFF: detected additive is flagged on the matching label token', () => {
  const { items, productFlags } = classifyFromOpenFoodFacts(
    off({
      ingredientsText: 'Pork, Water, Salt, Sodium Nitrite',
      additives: ['e250'],
    }),
  );
  assertEquals(items.find((i) => i.name === 'Sodium Nitrite')?.flag, 'avoid');
  assertEquals(items.filter((i) => i.flag === 'good').length, 3);
  assertEquals(productFlags, []);
});

Deno.test('OFF: additive not named on the label becomes a product-level flag', () => {
  const { items, productFlags } = classifyFromOpenFoodFacts(
    off({
      ingredientsText: 'Pork, Water, Salt, E250',
      additives: ['e250', 'e999999'], // unknown codes are ignored
    }),
  );
  assertEquals(
    items.every((i) => i.flag === 'good'),
    true,
  );
  assertEquals(
    productFlags.map((f) => f.key),
    ['additive-e250'],
  );
});

Deno.test('OFF: palm oil, nutrient levels, NOVA 4 and Nutri-Score D/E add product flags', () => {
  const { productFlags } = classifyFromOpenFoodFacts(
    off({
      ingredientsText: 'Sugar, Cocoa',
      palmOil: 'yes', // not named on the label → product flag
      nutrientLevels: ['sugars-in-high-quantity', 'salt-in-low-quantity'],
      novaGroup: 4,
      nutriscoreGrade: 'e',
    }),
  );
  assertEquals(
    productFlags.map((f) => f.key),
    ['palm-oil', 'nutrient-sugars-in-high-quantity', 'nova-4', 'nutriscore'],
  );
  assertEquals(productFlags.find((f) => f.key === 'nutriscore')?.label, 'Nutri-Score E');
});

Deno.test('OFF: palm oil named on the label is flagged inline, not duplicated', () => {
  const { items, productFlags } = classifyFromOpenFoodFacts(
    off({
      ingredientsText: 'Sugar, Palm Oil',
      palmOil: 'yes',
      nutriscoreGrade: 'b',
    }),
  );
  assertEquals(items.find((i) => i.name === 'Palm Oil')?.flag, 'avoid');
  assertEquals(productFlags, []);
});

Deno.test('OFF: no ingredient text yields no items', () => {
  const { items, tally } = classifyFromOpenFoodFacts(off({}));
  assertEquals(items, []);
  assertEquals(tally, { good: 0, watch: 0, avoid: 0 });
});
