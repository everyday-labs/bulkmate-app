// Pre-commit gate (run by costco-mobile/.husky/pre-commit from the repo root).
// Only staged files are formatted/linted; typecheck and tests run for the
// package the staged files belong to. The full suite runs on pre-push and in CI.
import path from 'node:path';

const MOBILE = 'costco-mobile';
const FUNCTIONS = 'costco-backend/supabase/functions';
const bin = (name) => `${MOBILE}/node_modules/.bin/${name}`;
const rel = (dir, files) => files.map((f) => JSON.stringify(path.relative(dir, f))).join(' ');
const inMobile = (cmd) => `sh -c ${JSON.stringify(`cd ${MOBILE} && ${cmd}`)}`;

export default {
  '*.{ts,tsx,js,mjs,cjs,json,yml,yaml,css,html}': (files) =>
    `${bin('prettier')} --write --ignore-unknown ${files.map((f) => JSON.stringify(f)).join(' ')}`,

  [`${MOBILE}/**/*.{ts,tsx,js}`]: (files) => [
    inMobile(
      `./node_modules/.bin/eslint --fix --max-warnings=0 --no-warn-ignored ${rel(MOBILE, files)}`,
    ),
    inMobile('./node_modules/.bin/tsc --noEmit'),
    inMobile(
      `CI=1 ./node_modules/.bin/jest --bail --passWithNoTests --findRelatedTests ${rel(MOBILE, files)}`,
    ),
  ],

  [`${MOBILE}/constants/colors.ts`]: () => inMobile('node scripts/check-contrast.js'),

  [`${FUNCTIONS}/**/*.ts`]: (files) => [
    `scripts/deno.sh lint ${rel(FUNCTIONS, files)}`,
    'scripts/deno.sh check .',
    'scripts/deno.sh test --allow-env',
  ],
};
