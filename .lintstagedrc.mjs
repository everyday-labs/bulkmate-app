// Pre-commit gate (run by costco-mobile/.husky/pre-commit from the repo root).
// Staged files are formatted and linted; typecheck and the tests related to
// the staged files run for the package they belong to. Full suite: pre-push
// (scripts/check-all.sh) and CI.
//
// String commands get the staged files appended as separate, absolute-path
// arguments by lint-staged — no shell quoting involved. Functions that ignore
// their argument run once without file arguments.

const MOBILE = 'scripts/in-mobile.sh';
const DENO = 'scripts/deno.sh';
const OPT = 'scripts/optional-tool.sh';

export default {
  '*.{ts,tsx,js,mjs,cjs,json,yml,yaml,css,html}':
    'costco-mobile/node_modules/.bin/prettier --write --ignore-unknown',

  'costco-mobile/**/*.{ts,tsx,js}': [
    `${MOBILE} ./node_modules/.bin/eslint --fix --max-warnings=0 --no-warn-ignored`,
    () => `${MOBILE} ./node_modules/.bin/tsc --noEmit`,
    `${MOBILE} env CI=1 ./node_modules/.bin/jest --bail --passWithNoTests --findRelatedTests`,
  ],

  'costco-mobile/constants/colors.ts': () => `${MOBILE} node scripts/check-contrast.js`,

  // GitHub Actions: syntax/expressions (actionlint) and security (zizmor).
  '.github/workflows/*.{yml,yaml}': [
    () => `${OPT} actionlint`,
    () => `${OPT} zizmor --no-progress --min-severity=low .github/workflows`,
  ],

  // Shell scripts and git hooks.
  'scripts/*.sh': `${OPT} shellcheck`,
  'costco-mobile/.husky/pre-*': `${OPT} shellcheck --shell=sh`,

  'costco-backend/supabase/functions/**/*.ts': [
    `${DENO} lint`,
    () => `${DENO} check .`,
    () => `${DENO} test --allow-env --allow-read`,
  ],
};
