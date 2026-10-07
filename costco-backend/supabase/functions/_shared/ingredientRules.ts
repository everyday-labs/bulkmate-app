// Ingredient classification. Two paths:
//
//   1. classifyFromOpenFoodFacts — PRIMARY. Driven by real structured data
//      (NOVA processing group, Nutri-Score, detected additive E-codes,
//      nutrient-level flags) from Open Food Facts, cross-referenced against
//      the curated additive database in additiveDatabase.ts. Precise: we
//      know exactly which additives are present rather than guessing from
//      ingredient-label wording.
//
//   2. classifyByKeyword — FALLBACK ONLY, used when Open Food Facts has no
//      match for a UPC and all we have is USDA FDC's raw ingredient text.
//      Plain substring matching against a curated keyword list — much
//      weaker than (1), since it has no idea what's actually in the product
//      beyond parsing the label text itself. Kept only so a product with no
//      OFF match still gets *some* signal instead of nothing.
//
// Both are curated judgment calls about what's worth flagging, not a
// certified medical or nutrition-science rating — see EXTERNAL_APIS.md.

import type { OffProduct } from './openFoodFacts.ts';
import { lookupAdditive } from './additiveDatabase.ts';

export type Flag = 'avoid' | 'watch';

export type ClassifiedIngredient = {
  name: string;
  flag: Flag | 'good';
  reason: string | null;
};

export type IngredientTally = { good: number; watch: number; avoid: number };

// Product-level flags — things that apply to the product as a whole
// (processing level, overall nutrition grade, a specific nutrient running
// high) rather than to one named ingredient, so they're surfaced
// separately from the per-ingredient list in the UI.
export type ProductFlag = {
  key: string;
  label: string;
  flag: Flag;
  reason: string;
};

// Splits a raw ingredient string on top-level commas only — sub-ingredient
// lists in parentheses (e.g. "ENRICHED FLOUR (WHEAT FLOUR, NIACIN, IRON)")
// stay grouped with their parent rather than exploding into fragments.
export function splitIngredients(text: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(') depth++;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      tokens.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens.filter(Boolean);
}

function tally(items: ClassifiedIngredient[]): IngredientTally {
  return items.reduce(
    (acc, item) => {
      acc[item.flag as keyof IngredientTally]++;
      return acc;
    },
    { good: 0, watch: 0, avoid: 0 } as IngredientTally,
  );
}

// ---------------------------------------------------------------------------
// 1. PRIMARY — Open Food Facts structured data
// ---------------------------------------------------------------------------

const NUTRIENT_LEVEL_LABELS: Record<string, string> = {
  'sugars-in-high-quantity': 'High in Added Sugar',
  'fat-in-high-quantity': 'High in Fat',
  'saturated-fat-in-high-quantity': 'High in Saturated Fat',
  'salt-in-high-quantity': 'High in Salt',
};

export function classifyFromOpenFoodFacts(off: OffProduct): {
  items: ClassifiedIngredient[];
  productFlags: ProductFlag[];
  tally: IngredientTally;
} {
  // Per-ingredient: split the label text, then flag any token whose text
  // contains a detected additive's common name (e.g. OFF told us "e330" is
  // present, additiveDatabase says that's "Citric Acid" — if the label
  // literally says "citric acid," highlight that exact token).
  const detectedAdditives = off.additives
    .map((code) => ({ code, entry: lookupAdditive(code) }))
    .filter(
      (a): a is { code: string; entry: NonNullable<ReturnType<typeof lookupAdditive>> } =>
        a.entry != null,
    );

  const rawTokens = off.ingredientsText ? splitIngredients(off.ingredientsText) : [];
  const items: ClassifiedIngredient[] = rawTokens.map((token) => {
    const upper = token.toUpperCase();
    const match = detectedAdditives.find((a) => upper.includes(a.entry.name.toUpperCase()));
    if (match) return { name: token, flag: match.entry.flag, reason: match.entry.reason };
    if (off.palmOil === 'yes' && upper.includes('PALM OIL')) {
      return {
        name: token,
        flag: 'avoid',
        reason: 'Linked to deforestation; look for RSPO-certified sourcing on the label.',
      };
    }
    return { name: token, flag: 'good', reason: null };
  });

  // Any detected concerning additive that we couldn't locate by name in the
  // label text (e.g. label only lists the E-number) still gets surfaced —
  // as a product-level flag rather than silently dropped.
  const unmatchedAdditives = detectedAdditives.filter(
    (a) => !items.some((i) => i.name.toUpperCase().includes(a.entry.name.toUpperCase())),
  );

  const productFlags: ProductFlag[] = [];

  for (const a of unmatchedAdditives) {
    productFlags.push({
      key: `additive-${a.code}`,
      label: a.entry.name,
      flag: a.entry.flag,
      reason: a.entry.reason,
    });
  }

  if (
    off.palmOil === 'yes' &&
    !items.some((i) => i.flag === 'avoid' && i.name.toUpperCase().includes('PALM OIL'))
  ) {
    productFlags.push({
      key: 'palm-oil',
      label: 'Contains Palm Oil',
      flag: 'avoid',
      reason: 'Linked to deforestation; look for RSPO-certified sourcing on the label.',
    });
  }

  for (const level of off.nutrientLevels) {
    const label = NUTRIENT_LEVEL_LABELS[level];
    if (label) {
      productFlags.push({
        key: `nutrient-${level}`,
        label,
        flag: 'watch',
        reason: 'Based on the product’s actual nutrition facts, not the ingredient list.',
      });
    }
  }

  if (off.novaGroup === 4) {
    productFlags.push({
      key: 'nova-4',
      label: 'Ultra-Processed (NOVA 4)',
      flag: 'watch',
      reason:
        'Industrially formulated with ingredients rarely used in home cooking. Not inherently unsafe, worth moderating.',
    });
  }

  if (off.nutriscoreGrade === 'd' || off.nutriscoreGrade === 'e') {
    productFlags.push({
      key: 'nutriscore',
      label: `Nutri-Score ${off.nutriscoreGrade.toUpperCase()}`,
      flag: 'watch',
      reason:
        'Lower end of the Nutri-Score scale (A best, E worst) — based on sugar, fat, salt, fiber, and protein content.',
    });
  }

  return { items, productFlags, tally: tally(items) };
}

// ---------------------------------------------------------------------------
// 2. FALLBACK — plain keyword matching against FDC's raw ingredient text
// ---------------------------------------------------------------------------

type FlagRule = { match: string; reason: string };

const AVOID_RULES: FlagRule[] = [
  {
    match: 'PARTIALLY HYDROGENATED',
    reason: 'A source of artificial trans fat, linked to heart disease risk.',
  },
  {
    match: 'HIGH FRUCTOSE CORN SYRUP',
    reason: 'Highly processed sweetener linked to metabolic concerns in excess.',
  },
  {
    match: 'PALM OIL',
    reason: 'Linked to deforestation; look for RSPO-certified sourcing on the label.',
  },
  { match: 'SODIUM NITRITE', reason: 'Preservative linked to processed-meat health concerns.' },
  { match: 'SODIUM NITRATE', reason: 'Preservative linked to processed-meat health concerns.' },
  {
    match: 'POTASSIUM BROMATE',
    reason: 'Flour treatment banned in the EU and several other countries.',
  },
  {
    match: 'RED 40',
    reason: 'Synthetic dye under scrutiny for links to hyperactivity in children.',
  },
  {
    match: 'YELLOW 5',
    reason: 'Synthetic dye under scrutiny for links to hyperactivity in children.',
  },
  {
    match: 'YELLOW 6',
    reason: 'Synthetic dye under scrutiny for links to hyperactivity in children.',
  },
  { match: 'BLUE 1', reason: 'Synthetic dye; some sensitivity concerns reported.' },
  {
    match: 'BHA',
    reason: 'Preservative flagged as a possible carcinogen by some health agencies.',
  },
  {
    match: 'BHT',
    reason: 'Preservative flagged as a possible carcinogen by some health agencies.',
  },
  { match: 'TBHQ', reason: 'Synthetic preservative; linked to concerns at high intake levels.' },
  {
    match: 'ASPARTAME',
    reason:
      'Artificial sweetener some people choose to avoid; generally recognized as safe in moderation.',
  },
];

const WATCH_RULES: FlagRule[] = [
  { match: 'SUGAR', reason: 'Added sugar — fine occasionally, worth tracking daily total.' },
  { match: 'CORN SYRUP', reason: 'Added sugar — fine occasionally, worth tracking daily total.' },
  { match: 'DEXTROSE', reason: 'A form of added sugar.' },
  {
    match: 'MALTODEXTRIN',
    reason: 'Highly processed starch, often used as a filler or thickener.',
  },
  {
    match: 'NATURAL FLAVOR',
    reason: 'Broad legal term — can mean many different compounds, not always disclosed.',
  },
  { match: 'ARTIFICIAL FLAVOR', reason: 'Synthetic flavoring compound, not naturally derived.' },
  {
    match: 'CARRAGEENAN',
    reason: 'Thickener with some digestive-sensitivity reports in research.',
  },
  { match: 'MONOSODIUM GLUTAMATE', reason: 'Flavor enhancer some people are sensitive to.' },
  { match: 'MSG', reason: 'Flavor enhancer some people are sensitive to.' },
  {
    match: 'SODIUM BENZOATE',
    reason:
      'Preservative; generally recognized as safe but worth noting for sodium-conscious diets.',
  },
];

function classifyToken(token: string): ClassifiedIngredient {
  const upper = token.toUpperCase();
  for (const rule of AVOID_RULES) {
    if (upper.includes(rule.match)) return { name: token, flag: 'avoid', reason: rule.reason };
  }
  for (const rule of WATCH_RULES) {
    if (upper.includes(rule.match)) return { name: token, flag: 'watch', reason: rule.reason };
  }
  return { name: token, flag: 'good', reason: null };
}

export function classifyByKeyword(rawText: string): {
  items: ClassifiedIngredient[];
  tally: IngredientTally;
} {
  const items = splitIngredients(rawText).map(classifyToken);
  return { items, tally: tally(items) };
}
