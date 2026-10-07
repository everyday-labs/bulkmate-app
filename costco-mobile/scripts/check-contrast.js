#!/usr/bin/env node
// Automated WCAG contrast check for constants/colors.ts — reads the real
// LightColors/DarkColors objects (not a hand-maintained copy) so it can't
// silently drift out of date, and checks the actual text/background token
// pairings used across the app. This is the tooling item from
// docs/design-system/reference-app-audit-2026-08-05.md #18: two real
// dark-mode contrast bugs (profile avatar, ScanFAB speed-dial labels) were
// found and fixed by hand this session that a check like this would have
// caught automatically.
//
// Usage: node scripts/check-contrast.js  (wired up as `npm run check:contrast`)

const fs = require('fs');
const path = require('path');

const COLORS_PATH = path.join(__dirname, '..', 'constants', 'colors.ts');

function extractObjectLiteral(source, marker) {
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Could not find "${marker}" in colors.ts`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(braceStart, i + 1);
    }
  }
  throw new Error(`Unbalanced braces reading "${marker}"`);
}

function loadPalettes() {
  const source = fs.readFileSync(COLORS_PATH, 'utf8');
  const lightLiteral = extractObjectLiteral(source, 'export const LightColors');
  const darkLiteral = extractObjectLiteral(source, 'export const DarkColors');
  const LightColors = new Function(`return ${lightLiteral};`)();
  const DarkColors = new Function(`return ${darkLiteral};`)();
  return { LightColors, DarkColors };
}

// ── WCAG relative luminance + contrast ratio ─────────────────────────────────
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

function channelLuminance(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function contrastRatio(hexA, hexB) {
  const lA = relativeLuminance(hexA) + 0.05;
  const lB = relativeLuminance(hexB) + 0.05;
  return lA > lB ? lA / lB : lB / lA;
}

// ── Real token pairings used in the app (foreground, background, min ratio, context) ──
// minRatio: 4.5 = WCAG AA normal text, 3.0 = WCAG AA large/bold text (≥18pt or ≥14pt bold),
// which covers most of these (badge labels, chip labels, button labels are all bold).
function pairings(C) {
  return [
    ['gray[900] on background', C.gray[900], C.background, 4.5],
    ['gray[800] on surface', C.gray[800], C.surface, 4.5],
    ['gray[400] on background (muted/meta text)', C.gray[400], C.background, 3.0],
    ['gray[400] on surface (muted/meta text)', C.gray[400], C.surface, 3.0],
    ['white on costcoRedSolid (primary CTA)', C.white, C.costcoRedSolid, 4.5],
    ['white on costcoRedDark (pressed CTA)', C.white, C.costcoRedDark, 4.5],
    ['white on navySolid (avatar/active pill)', C.white, C.navySolid, 4.5],
    ['white on darkSolid (FAB speed-dial)', C.white, C.darkSolid, 4.5],
    ['white on successSolid (celebration stamp)', C.white, C.successSolid, 4.5],
    [
      'executiveNavy on executiveNavySubtle (chip text)',
      C.executiveNavy,
      C.executiveNavySubtle,
      4.5,
    ],
    ['costcoRed on costcoRedSubtle (chip text)', C.costcoRed, C.costcoRedSubtle, 3.0],
    ['goldStarDark on goldStarSubtle (chip text)', C.goldStarDark, C.goldStarSubtle, 3.0],
    ['successText on successBg', C.successText, C.successBg, 4.5],
    ['warningText on warningBg', C.warningText, C.warningBg, 4.5],
    ['error on errorBg', C.error, C.errorBg, 4.5],
    ['info on infoBg', C.info, C.infoBg, 4.5],
  ];
}

function checkTheme(name, C) {
  console.log(`\n${name}`);
  console.log('-'.repeat(name.length));
  let failures = 0;
  for (const [label, fg, bg, minRatio] of pairings(C)) {
    const ratio = contrastRatio(fg, bg);
    const pass = ratio >= minRatio;
    if (!pass) failures++;
    const status = pass ? 'PASS' : 'FAIL';
    console.log(`  [${status}] ${label}: ${ratio.toFixed(2)}:1 (needs ${minRatio}:1)`);
  }
  return failures;
}

function main() {
  const { LightColors, DarkColors } = loadPalettes();
  const lightFailures = checkTheme('Light theme', LightColors);
  const darkFailures = checkTheme('Dark theme', DarkColors);
  const total = lightFailures + darkFailures;
  console.log(`\n${total === 0 ? 'All pairings pass.' : `${total} pairing(s) below WCAG AA.`}`);
  process.exit(total === 0 ? 0 : 1);
}

main();
