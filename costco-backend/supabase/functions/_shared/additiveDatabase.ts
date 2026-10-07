// Curated reference for food additive E-codes, keyed to what Open Food
// Facts actually returns in `additives_tags` (e.g. "e330"). This is the
// judgment layer on top of real data — OFF tells us *which* additives are
// actually in the product; this table says which of those are worth
// flagging and why.
//
// Deliberately NOT exhaustive and NOT "every E-number is bad" — most food
// additives (citric acid/E330, lecithin/E322, baking soda/E500, vitamin C/
// E300, xanthan gum/E415, etc.) are unflagged on purpose; only ones with
// documented regulatory action or research-flagged concern are listed.
// A curated safety judgment, not a certified medical rating — same caveat
// as before, just now anchored to real detected additives instead of
// scanning free text for keywords.

export type AdditiveFlag = 'avoid' | 'watch';

export type AdditiveEntry = {
  name: string;
  flag: AdditiveFlag;
  reason: string;
};

// Keys are bare lowercase E-codes without the "en:" OFF prefix, e.g. "e330".
export const ADDITIVE_DATABASE: Record<string, AdditiveEntry> = {
  // --- Nitrites/nitrates (cured/processed meat preservatives) ---
  e249: {
    name: 'Potassium Nitrite',
    flag: 'avoid',
    reason: 'Preservative linked to processed-meat health concerns.',
  },
  e250: {
    name: 'Sodium Nitrite',
    flag: 'avoid',
    reason: 'Preservative linked to processed-meat health concerns.',
  },
  e251: {
    name: 'Sodium Nitrate',
    flag: 'avoid',
    reason: 'Preservative linked to processed-meat health concerns.',
  },
  e252: {
    name: 'Potassium Nitrate',
    flag: 'avoid',
    reason: 'Preservative linked to processed-meat health concerns.',
  },

  // --- Synthetic antioxidants/preservatives with research/regulatory flags ---
  e319: {
    name: 'TBHQ',
    flag: 'avoid',
    reason: 'Synthetic preservative; linked to concerns at high intake levels.',
  },
  e320: {
    name: 'BHA',
    flag: 'avoid',
    reason: 'Preservative flagged as a possible carcinogen by some health agencies.',
  },
  e321: {
    name: 'BHT',
    flag: 'avoid',
    reason: 'Preservative flagged as a possible carcinogen by some health agencies.',
  },

  // --- Synthetic dyes (hyperactivity concern in children, several under EU warning labels) ---
  e102: {
    name: 'Tartrazine (Yellow 5)',
    flag: 'avoid',
    reason: 'Synthetic dye under scrutiny for links to hyperactivity in children.',
  },
  e104: {
    name: 'Quinoline Yellow',
    flag: 'avoid',
    reason: 'Synthetic dye under scrutiny for links to hyperactivity in children.',
  },
  e110: {
    name: 'Sunset Yellow (Yellow 6)',
    flag: 'avoid',
    reason: 'Synthetic dye under scrutiny for links to hyperactivity in children.',
  },
  e122: {
    name: 'Carmoisine',
    flag: 'avoid',
    reason: 'Synthetic dye under scrutiny for links to hyperactivity in children.',
  },
  e124: {
    name: 'Ponceau 4R',
    flag: 'avoid',
    reason: 'Synthetic dye under scrutiny for links to hyperactivity in children.',
  },
  e127: {
    name: 'Erythrosine (Red 3)',
    flag: 'avoid',
    reason: 'Synthetic dye; restricted in some countries.',
  },
  e129: {
    name: 'Allura Red (Red 40)',
    flag: 'avoid',
    reason: 'Synthetic dye under scrutiny for links to hyperactivity in children.',
  },
  e131: {
    name: 'Patent Blue V',
    flag: 'avoid',
    reason: 'Synthetic dye; some sensitivity concerns reported.',
  },
  e133: {
    name: 'Brilliant Blue (Blue 1)',
    flag: 'avoid',
    reason: 'Synthetic dye; some sensitivity concerns reported.',
  },
  e142: {
    name: 'Green S',
    flag: 'avoid',
    reason: 'Synthetic dye; some sensitivity concerns reported.',
  },

  // --- Other flour/dough treatments with regulatory bans elsewhere ---
  e924: {
    name: 'Potassium Bromate',
    flag: 'avoid',
    reason: 'Flour treatment banned in the EU and several other countries.',
  },

  // --- Artificial sweeteners some people choose to avoid ---
  e951: {
    name: 'Aspartame',
    flag: 'watch',
    reason:
      'Artificial sweetener some people choose to avoid; generally recognized as safe in moderation.',
  },
  e950: {
    name: 'Acesulfame K',
    flag: 'watch',
    reason: 'Artificial sweetener some people choose to avoid.',
  },
  e955: {
    name: 'Sucralose',
    flag: 'watch',
    reason: 'Artificial sweetener some people choose to avoid.',
  },

  // --- Common preservatives/enhancers worth a heads-up, not a red flag ---
  e211: {
    name: 'Sodium Benzoate',
    flag: 'watch',
    reason:
      'Preservative; generally recognized as safe but worth noting for sodium-conscious diets.',
  },
  e407: {
    name: 'Carrageenan',
    flag: 'watch',
    reason: 'Thickener with some digestive-sensitivity reports in research.',
  },
  e621: {
    name: 'Monosodium Glutamate (MSG)',
    flag: 'watch',
    reason: 'Flavor enhancer some people are sensitive to.',
  },
};

export function lookupAdditive(code: string): AdditiveEntry | null {
  return ADDITIVE_DATABASE[code.toLowerCase()] ?? null;
}
