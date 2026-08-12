export type ParsedReceipt = {
  warehouseCode: string | null;
  transactionDate: string | null;
  transactionNumber: string | null;
  items: ParsedItem[];
  subtotal: number | null;
  tax: number | null;
  grandTotal: number | null;
  expectedItemCount: number | null;
  itemCountMismatch: boolean;
};

export type ParsedItem = {
  sku: string;
  description: string;
  /** Per-unit price. Line total is `unitPrice * quantity - discountAmount`. */
  unitPrice: number;
  discountAmount: number;
  /** >1 when the same SKU was printed on multiple lines — see mergeBySku. */
  quantity: number;
};

export function parseReceiptText(text: string): ParsedReceipt {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const items = extractItems(lines);
  const expectedItemCount = extractItemCount(lines);
  const subtotal = extractSubtotal(lines);
  return {
    warehouseCode: extractWarehouseCode(lines),
    transactionDate: extractDate(lines),
    transactionNumber: extractTransactionNumber(lines),
    items,
    subtotal,
    tax: extractTax(lines),
    grandTotal: extractGrandTotal(lines),
    expectedItemCount,
    // Compare total UNITS, not row count — the receipt's "TOTAL NUMBER OF
    // ITEMS SOLD" counts each unit, while mergeBySku collapses repeat SKUs
    // into one row with quantity > 1. Using items.length here would report a
    // false mismatch on every receipt containing a multi-buy.
    itemCountMismatch:
      expectedItemCount !== null &&
      items.reduce((n, i) => n + i.quantity, 0) !== expectedItemCount,
  };
}

function extractWarehouseCode(lines: string[]): string | null {
  for (const line of lines) {
    const match = line.match(/#(\d{3,4})/) ?? line.match(/WAREHOUSE\s+(\d{3,4})/i);
    if (match) return match[1];
  }
  return null;
}

function extractDate(lines: string[]): string | null {
  for (const line of lines) {
    const match = line.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (match) {
      let [, month, day, yearRaw] = match;
      const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
      let m = parseInt(month), d = parseInt(day);
      if (m > 12 && d <= 12) [m, d] = [d, m];
      if (m < 1 || m > 12 || d < 1 || d > 31) continue;
      return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return null;
}

function extractItemCount(lines: string[]): number | null {
  for (const line of lines) {
    // "TOTAL NUMBER OF ITEMS SOLD = 4" or "TOTAL NUMBER OF ITEMS SOLD - 5"
    const m1 = line.match(/TOTAL\s+NUMBER\s+OF\s+ITEMS\s+SOLD\s*[-=]\s*(\d+)/i);
    if (m1) return parseInt(m1[1]);
    // "4 Items Sold" or "Items Sold: 5"
    const m2 = line.match(/(\d+)\s+Items?\s+Sold/i);
    if (m2) return parseInt(m2[1]);
    const m3 = line.match(/Items?\s+Sold\s*:?\s*(\d+)/i);
    if (m3) return parseInt(m3[1]);
  }
  return null;
}

function extractSubtotal(lines: string[]): number | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // "SUBTOTAL 48.75" / "SUB TOTAL $48.75" / "SUB-TOTAL  48.75"
    const inline = line.match(/^SUB[\s-]?TOTAL\s+\$?(\d{1,6}\.\d{2})/i);
    if (inline) return parseFloat(inline[1]);
    // SUBTOTAL keyword alone, amount on next line (with or without $)
    if (/^SUB[\s-]?TOTAL$/i.test(line) && i + 1 < lines.length) {
      const next = lines[i + 1].match(/^\$?(\d{1,6}\.\d{2})/);
      if (next) return parseFloat(next[1]);
    }
  }
  return null;
}

function extractTax(lines: string[]): number | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // "TAX  3.50" / "CA TAX $3.50" / "TX TAX  2.10"
    const inline = line.match(/(?:^|[A-Z]{2}\s+)TAX\s+\$?(\d{1,4}\.\d{2})/i);
    if (inline) return parseFloat(inline[1]);
    // "TAX" alone, amount on next line
    if (/^(?:[A-Z]{2}\s+)?TAX$/i.test(line) && i + 1 < lines.length) {
      const next = lines[i + 1].match(/^\$?(\d{1,4}\.\d{2})/);
      if (next) return parseFloat(next[1]);
    }
  }
  return null;
}

function extractGrandTotal(lines: string[]): number | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // "**** TOTAL  $48.47" or "** TOTAL  48.47"
    const inline = line.match(/^\*+\s*TOTAL\s+\$?(\d{1,6}\.\d{2})/i);
    if (inline) return parseFloat(inline[1]);
    // "**** TOTAL" alone, amount on next line
    if (/^\*+\s*TOTAL$/i.test(line) && i + 1 < lines.length) {
      const next = lines[i + 1].match(/^\$?(\d{1,6}\.\d{2})/);
      if (next) return parseFloat(next[1]);
    }
  }
  return null;
}

function extractTransactionNumber(lines: string[]): string | null {
  // Pass 1: explicit TC# label — handles spaces, dashes, and multi-line splits
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const inline = line.match(/TC#\s*([\d\s\-]{6,})/i);
    if (inline) return inline[1].replace(/[\s\-]+/g, '').trim();
    if (/^TC#$/i.test(line.trim()) && i + 1 < lines.length) {
      const next = lines[i + 1].match(/^([\d\s]{6,})$/);
      if (next) return next[1].replace(/\s+/g, '').trim();
    }
  }

  // Pass 2: barcode digit string printed below the bottom barcode.
  // Appears after the TOTAL/payment section as a standalone 10-20 digit line.
  let pastTotal = false;
  for (const line of lines) {
    if (/^\*+\s*TOTAL/i.test(line)) { pastTotal = true; continue; }
    if (pastTotal && /^\d{10,20}$/.test(line)) return line;
  }

  return null;
}

// ─── Item extraction ──────────────────────────────────────────────────────────
//
// Costco self-checkout OCR reads the receipt in column order, not row order.
// This means groups of item descriptions may appear before groups of prices,
// even within the same item section (partial-batch layout):
//
//   items 1-3  |  prices 1-3
//   items 4-5  |  prices 4-5
//
// A state machine that expects item-then-price in sequence cannot handle this.
// Instead we use a two-pass zip:
//   Pass 1 — collect SKU entries and standalone prices in document order.
//   Pass 2 — zip: each SKU entry without an inline price consumes the next
//            standalone price in sequence.
//
// A warehouse street address ("1601 Coleman Ave", "5301 Almaden Expressway")
// has the same shape as a SKU line — leading digits then text — so it must be
// excluded explicitly. Matches a trailing street-type word; no real Costco
// item description ends in one of these.
const STREET_ADDRESS_PATTERN =
  /\b(AVE|AVENUE|ST|STREET|RD|ROAD|BLVD|BOULEVARD|DR|DRIVE|WAY|LN|LANE|PKWY|PARKWAY|HWY|HIGHWAY|EXPY|EXPRESSWAY|CT|COURT|PL|PLACE|TER|TERRACE|CIR|CIRCLE)\.?$/i;

function extractItems(lines: string[]): ParsedItem[] {
  // Find the item section: after the Member line, before SUBTOTAL.
  let itemStart = -1;
  let subtotalIdx = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (itemStart === -1) {
      // Fuzzy "Member": Vision routinely confuses M/N and b/h in this word —
      // a real receipt came through as "OX Nember 111894060404", which the
      // old exact /Member/i missed, sending the parser down the fallback path
      // and swallowing the store's street address as an item.
      if (/\b[MN]e[mn][bh]er\b/i.test(line)) {
        // Member number may be on same line ("59 Member 112051125767") or next line
        itemStart = /\d/.test(line) ? i + 1 : i + 2;
      }
      continue;
    }
    // Match "SUBTOTAL", "SUB TOTAL", "SUB-TOTAL", "**** TOTAL", "** TOTAL", etc.
    if (/^SUB[\s-]?TOTAL|^\*+\s*TOTAL/i.test(line)) {
      subtotalIdx = i;
      break;
    }
  }

  // Fallback: no Member line found — start at first SKU-like line that isn't
  // the warehouse's own street address. "1601 Coleman Ave" satisfies the
  // SKU shape (4-9 leading digits) and was really parsed as a $29.99 item on
  // a live receipt, which then consumed the first real item's price and
  // shifted every subsequent price by one.
  if (itemStart === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (/^[A-Z]?[0-9]{3,9}(\s|$)/.test(lines[i]) && !STREET_ADDRESS_PATTERN.test(lines[i])) {
        itemStart = i;
        break;
      }
    }
  }

  if (itemStart === -1) return [];

  const itemLines = lines.slice(itemStart, subtotalIdx);

  // ── Pass 1: classify each line ────────────────────────────────────────────

  // Coupon/CRV barcodes: 10+ leading digits (e.g. "00003790641898148", "0600000000 CA REDEMP V")
  const couponPattern   = /^\d{10,}/;
  // SKU with inline price at end: "1234 ITEM NAME 8.99" or "1234567 8.99 A"
  // Min 4 digits: some Costco SKUs (e.g. 7812 YELLOW ONION) are 4 digits.
  // Optional leading letter may be attached ("E200303") or space-separated
  // ("E 200303 PEELD GARLIC") — Vision emits both. The old patterns only
  // allowed the attached form, silently dropping the spaced ones.
  //
  // Minimum SKU length is 3, not 4: a real receipt had "177 4LB ORG FUJI",
  // and dropping it didn't just lose that item — it shifted every following
  // price by one, corrupting three neighbouring items too. Verified against
  // the full 12-case layout regression: lowering the floor changed no other
  // result. The section boundaries (Member → SUBTOTAL) plus the aggregate and
  // street-address filters are what keep short numbers from being misread as
  // SKUs, not the digit count itself.
  const skuWithPrice    = /^(?:[A-Z]\s*)?([0-9]{3,9})\s+(.*?)\s+(\d{1,3}\.\d{2})\s*[A-Z]?\s*$/;
  // SKU without price: "1234 ITEM NAME" or just "1234567"
  const skuOnly         = /^(?:[A-Z]\s*)?([0-9]{3,9})(?:\s+(.*))?$/;
  // Standalone price on its own line: "8.99", "24.99 A", ".99" (OCR-dropped leading digit)
  // \d* allows zero leading digits; \s*[A-Z]?\s* allows optional trailing tax code letter.
  const standalonePrice = /^(\d*\.\d{2})\s*[A-Z]?\s*$/;
  // Instant-savings line: "2.30-" or "3.00-A" (trailing tax code variant)
  const savingsLine     = /^(\d{1,3}\.\d{2})-\s*[A-Z]?\s*$/;

  type SkuEntry = { sku: string; description: string; price: number | null; discountAmount: number };
  const skuEntries: SkuEntry[] = [];
  // Indices of skuEntries still waiting for a standalone price, oldest first.
  const pending: number[] = [];
  // Index of the entry that most recently received a price — a savings line
  // always applies to that one.
  let lastPricedIdx: number | null = null;

  // Lines that should never appear in the item section but might if OCR misreads
  // the SUBTOTAL boundary — skip them defensively.
  const aggregateLinePattern = /^(SUB[\s-]?TOTAL|TAX\b|\*{2,}|CHANGE\b|APPROVED|VISA|AMOUNT:|INSTANT\s+SAVINGS|TOTAL\s+NUMBER)/i;

  for (const line of itemLines) {
    if (!line || aggregateLinePattern.test(line)) continue;
    // Belt-and-braces: even inside the item section, never treat a street
    // address as an item (a mis-detected section start can drag the header in).
    if (STREET_ADDRESS_PATTERN.test(line)) continue;

    // Coupon / CRV barcode lines carry no item data — skip the line itself.
    // (Deliberately no "skip the next price" flag here; see the greedy
    // assignment note below for why that approach was wrong.)
    if (couponPattern.test(line)) continue;

    // Savings/instant-discount line — attach to whichever item most recently
    // received a price, covering both the inline-price and standalone-price
    // cases with one rule.
    const sav = line.match(savingsLine);
    if (sav) {
      if (lastPricedIdx !== null) skuEntries[lastPricedIdx].discountAmount = parseFloat(sav[1]);
      continue;
    }

    // SKU with inline price
    const withPrice = line.match(skuWithPrice);
    if (withPrice) {
      const sku   = withPrice[1].replace(/^([A-Z])(?=[0-9])/, '');
      const desc  = withPrice[2].replace(/\s+[A-Z]$/, '').trim();
      const price = parseFloat(withPrice[3]);
      if (price > 0) {
        skuEntries.push({ sku, description: desc || `Item ${sku}`, price, discountAmount: 0 });
        lastPricedIdx = skuEntries.length - 1;
      }
      continue;
    }

    // SKU without inline price — queue it as awaiting the next standalone price.
    const only = line.match(skuOnly);
    if (only) {
      const sku  = only[1].replace(/^([A-Z])(?=[0-9])/, '');
      const desc = (only[2] ?? '').replace(/\s+[A-Z]$/, '').trim();
      skuEntries.push({ sku, description: desc || `Item ${sku}`, price: null, discountAmount: 0 });
      pending.push(skuEntries.length - 1);
      continue;
    }

    // Standalone price — assign to the oldest still-unpriced SKU. If nothing
    // is waiting, this price doesn't belong to an item (CRV deposit, stray
    // aggregate) and is discarded.
    const px = line.match(standalonePrice);
    if (px) {
      const price = parseFloat(px[1]);
      if (price > 0 && pending.length > 0) {
        const idx = pending.shift()!;
        skuEntries[idx].price = price;
        lastPricedIdx = idx;
      }
    }
  }

  // ── Trailing-price recovery ───────────────────────────────────────────────
  // On badly column-ordered scans, Vision can flush the entire right-hand
  // price column *after* the SUBTOTAL/TOTAL labels, stranding the last few
  // items' prices below the section boundary. Observed on a real 17-item
  // receipt where "KS COCNT WTR" and "SNAPWARE18PC" had their prices ($12.99,
  // $24.99) printed after "TOTAL NUMBER OF ITEMS SOLD".
  //
  // Only runs when SKUs are still unpriced, and stops the moment they're all
  // filled — so the trailing subtotal/tax/total figures are never consumed.
  // Sub-$1 amounts are skipped here because CRV deposits interleave with the
  // real prices in this block; that guard is deliberately scoped to this
  // recovery path so it can't affect the legitimate sub-$1 item case handled
  // in the main pass.
  if (pending.length > 0) {
    // `recovering` gates price consumption, but the loop deliberately keeps
    // running one step past the last assignment so a savings line printed
    // immediately after the final recovered price still lands (a real receipt
    // had SNAPWARE18PC's "5.00-" on the line right after its $24.99).
    let recovering = true;
    for (let i = subtotalIdx; i < lines.length; i++) {
      const line = lines[i];
      if (STREET_ADDRESS_PATTERN.test(line) || couponPattern.test(line)) continue;

      const sav = line.match(savingsLine);
      if (sav) {
        if (recovering && lastPricedIdx !== null) {
          skuEntries[lastPricedIdx].discountAmount = parseFloat(sav[1]);
        }
        continue;
      }

      const px = line.match(standalonePrice);
      if (px) {
        const price = parseFloat(px[1]);
        if (price < 1) continue; // CRV deposit interleaved in this block
        if (pending.length > 0) {
          const idx = pending.shift()!;
          skuEntries[idx].price = price;
          lastPricedIdx = idx;
        } else {
          // First non-item price after everything is filled — from here on
          // we're into subtotal/tax/total territory, so stop absorbing.
          recovering = false;
        }
      }
    }
  }

  // ── Pass 2: emit ──────────────────────────────────────────────────────────
  // Prices were already matched to their SKU during the single greedy pass
  // above, so this just drops any entry that never received one (a SKU-like
  // line with no corresponding price — usually an OCR artifact).
  const priced = skuEntries
    .filter((e): e is SkuEntry & { price: number } => e.price !== null)
    .map((e) => ({
      sku: e.sku,
      description: e.description,
      unitPrice: e.price,
      discountAmount: e.discountAmount,
      quantity: 1,
    }));

  return mergeBySku(priced);
}

/**
 * Costco prints each unit of a multi-buy on its own line rather than using a
 * "2 @ 12.99" format, so buying two of something yields two identical rows.
 * SKU is the canonical product identifier — descriptions are OCR-noisy and
 * the *same* product can read differently on two lines (a real receipt had
 * SKU 1518783 as both "CUCNT WIN" and "KS COCNT TR"). So lines are merged on
 * SKU, never on description.
 *
 * Grouping is on SKU **and** unit price together. Same SKU at the same price
 * is unambiguously the same product bought N times → merge, summing quantity
 * and discounts. Same SKU at *different* prices is left as separate rows,
 * because collapsing those would force us to invent a single unit price and
 * would silently misstate the line total.
 */
function mergeBySku(items: ParsedItem[]): ParsedItem[] {
  const merged = new Map<string, ParsedItem>();

  for (const item of items) {
    // Price is part of the key, not just the SKU — see doc comment above.
    const key = `${item.sku}|${item.unitPrice.toFixed(2)}`;
    const existing = merged.get(key);

    if (existing) {
      existing.quantity += item.quantity;
      // Discounts are per-line, so they add up across the merged lines.
      existing.discountAmount += item.discountAmount;
    } else {
      // First occurrence wins the description — arbitrary but stable, and
      // no more trustworthy than any later OCR read of the same product.
      merged.set(key, { ...item });
    }
  }

  return [...merged.values()];
}
