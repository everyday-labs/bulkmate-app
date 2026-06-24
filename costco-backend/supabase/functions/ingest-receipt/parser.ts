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
  unitPrice: number;
  discountAmount: number;
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
    itemCountMismatch: expectedItemCount !== null && items.length !== expectedItemCount,
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
function extractItems(lines: string[]): ParsedItem[] {
  // Find the item section: after the Member line, before SUBTOTAL.
  let itemStart = -1;
  let subtotalIdx = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (itemStart === -1) {
      if (/Member/i.test(line)) {
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

  // Fallback: no Member line found — start at first SKU-like line
  if (itemStart === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (/^[A-Z]?[0-9]{5,9}(\s|$)/.test(lines[i])) {
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
  const skuWithPrice    = /^([A-Z]?[0-9]{4,9})\s+(.*?)\s+(\d{1,3}\.\d{2})\s*[A-Z]?\s*$/;
  // SKU without price: "1234 ITEM NAME" or just "1234567"
  const skuOnly         = /^([A-Z]?[0-9]{4,9})(?:\s+(.*))?$/;
  // Standalone price on its own line: "8.99", "24.99 A", ".99" (OCR-dropped leading digit)
  // \d* allows zero leading digits; \s*[A-Z]?\s* allows optional trailing tax code letter.
  const standalonePrice = /^(\d*\.\d{2})\s*[A-Z]?\s*$/;
  // Instant-savings line: "2.30-" or "3.00-A" (trailing tax code variant)
  const savingsLine     = /^(\d{1,3}\.\d{2})-\s*[A-Z]?\s*$/;

  type SkuEntry = { sku: string; description: string; inlinePrice: number | null; discountAmount: number };
  const skuEntries: SkuEntry[] = [];
  const prices: number[] = [];
  // savingsMap[priceIndex] = discount that applies to that price
  const savingsMap = new Map<number, number>();

  // Lines that should never appear in the item section but might if OCR misreads
  // the SUBTOTAL boundary — skip them defensively.
  const aggregateLinePattern = /^(SUB[\s-]?TOTAL|TAX\b|\*{2,}|CHANGE\b|APPROVED|VISA|AMOUNT:|INSTANT\s+SAVINGS|TOTAL\s+NUMBER)/i;

  // CRV redemption barcodes (e.g. "0600000000 CA REDEMP V") are filtered by
  // couponPattern, but their associated price line (e.g. "0.30") must also be
  // skipped, otherwise it consumes a zip slot and misaligns all subsequent prices.
  // We detect CRV by the "REDEMP" text and set a one-shot skip flag for the
  // next standalone price line.
  let skipNextPrice = false;

  for (const line of itemLines) {
    if (!line || aggregateLinePattern.test(line)) continue;

    if (couponPattern.test(line)) {
      if (/REDEMP/i.test(line)) skipNextPrice = true;
      continue;
    }

    // Savings/instant-discount line.
    // Case A: a standalone price was already collected → attach to it via savingsMap.
    // Case B: no standalone price yet (inline-price item came before this savings line)
    //         → attach directly to the last skuEntry that has an inlinePrice.
    const sav = line.match(savingsLine);
    if (sav) {
      const amount = parseFloat(sav[1]);
      if (prices.length > 0) {
        savingsMap.set(prices.length - 1, amount);
      } else if (skuEntries.length > 0 && skuEntries[skuEntries.length - 1].inlinePrice !== null) {
        skuEntries[skuEntries.length - 1].discountAmount = amount;
      }
      continue;
    }

    // SKU with inline price
    const withPrice = line.match(skuWithPrice);
    if (withPrice) {
      const sku   = withPrice[1].replace(/^([A-Z])(?=[0-9])/, '');
      const desc  = withPrice[2].replace(/\s+[A-Z]$/, '').trim();
      const price = parseFloat(withPrice[3]);
      if (price > 0) skuEntries.push({ sku, description: desc || `Item ${sku}`, inlinePrice: price, discountAmount: 0 });
      continue;
    }

    // SKU without inline price
    const only = line.match(skuOnly);
    if (only) {
      const sku  = only[1].replace(/^([A-Z])(?=[0-9])/, '');
      const desc = (only[2] ?? '').replace(/\s+[A-Z]$/, '').trim();
      skuEntries.push({ sku, description: desc || `Item ${sku}`, inlinePrice: null, discountAmount: 0 });
      continue;
    }

    // Standalone price line — CRV amounts are skipped via the one-shot flag set
    // when their barcode line was encountered above.
    const px = line.match(standalonePrice);
    if (px) {
      if (skipNextPrice) { skipNextPrice = false; continue; }
      const price = parseFloat(px[1]);
      if (price > 0) prices.push(price);
    }
  }

  // ── Pass 2: zip SKU entries with prices ───────────────────────────────────
  // Cap prices to the number of SKU entries: any extra prices (e.g. subtotal
  // amount that slipped through) will never be zipped with an item.
  const cappedPrices = prices.slice(0, skuEntries.length);

  const items: ParsedItem[] = [];
  let priceIdx = 0;

  for (const entry of skuEntries) {
    if (entry.inlinePrice !== null) {
      items.push({ sku: entry.sku, description: entry.description, unitPrice: entry.inlinePrice, discountAmount: entry.discountAmount });
    } else {
      if (priceIdx >= cappedPrices.length) continue;
      const price    = cappedPrices[priceIdx];
      const discount = savingsMap.get(priceIdx) ?? 0;
      priceIdx++;
      items.push({ sku: entry.sku, description: entry.description, unitPrice: price, discountAmount: discount });
    }
  }

  return items;
}
