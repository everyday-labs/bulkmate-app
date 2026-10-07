# Bulkmate

An open-source, gamified warehouse-club companion app for iOS and Android, by **[Everyday Labs](https://everyday-labs.org)**. Built as a side project to solve real pain points — receipt tracking, price-match alerts, and making warehouse visits a little more fun.

> **Naming note:** this app was called "Costco Companion" during early development and was renamed to **Bulkmate** before beta distribution. An app named and branded as Costco implies an affiliation that doesn't exist — an App Review rejection trigger and a trademark exposure. Factual references to Costco throughout the app and these docs are deliberate: it genuinely reads Costco receipts, and describing that is nominative use. Only the app's *own* branding changed.

---

## What it does

- **Receipt OCR** — Scan a physical Costco receipt with your camera. The app parses every line item and stores it automatically.
- **Sliding-window price matching** — If a price drops within 30 days of your purchase, you get a push notification and an email with the refund amount. Each drop notifies once (again only if the price falls further), and email can be turned off in Profile → Preferences or with the one-click unsubscribe link.
- **Geo-fenced check-ins** — Check in when you're physically at a warehouse and earn stars toward your fan tier.
- **Badge engine** — Unlock badges for milestones: first visit, five check-ins, rare warehouses, and more.
- **Spend analytics** — Monthly spend chart, top items by cost, in-store savings vs. price-match savings breakdown.
- **Product barcode scanner** — Scan any product barcode for pricing, reviews, and community price history, plus a good/watch/avoid ingredient breakdown sourced from Open Food Facts (NOVA processing group, Nutri-Score, and flagged additives) when available.
- **Unified Recent feed** — Receipts and viewed products show up together on the home screen in one chronological feed, grouped by day, with quick filter chips to narrow it to just receipts or just viewed items.
- **Check-in on receipt scan** — Scanning a receipt is proof you were at the warehouse, so it earns the same star as a GPS check-in, dated to the receipt's transaction date rather than the day you uploaded it. Scanning twice from one trip is a silent no-op, not a double award.
- **Manual warehouse picker** — When the parser can't match a receipt's header to a known warehouse, a searchable picker lets you choose it by name, city, or ZIP. It's never required: the receipt is already saved, and "Can't find my warehouse" keeps it that way.
- **Account deletion** — Delete your account and everything in it from inside the app: every receipt and scanned image, all items, price alerts, check-ins, stars, and badges.
- **Sign in your way** — Email + password (confirmed with an 8-digit emailed code), Sign in with Apple, or Google. Forgot your password? Reset it in-app with an emailed code. Google and Apple sign-ups get their name filled in automatically; everyone else sees an optional, dismissible "What should we call you?" card on Home.

## Why these features exist

Costco already has a real, generous price-adjustment policy — most members just don't track prices closely enough to use it. Every feature here traces back to a specific, well-known pain point of shopping at a warehouse club:

- **Price-match window** — Costco will refund the difference if a price drops within 30 days, but that means remembering what you paid, when, and checking back manually. The sliding-window matcher does that watching for you and only interrupts you (push + email) when there's an actual refund on the table.
- **Receipt tracking** — Costco receipts are long, itemized by SKU rather than plain product names, and easy to lose. OCR ingestion turns a photo into structured data once, instead of a spreadsheet you have to maintain by hand.
- **Ingredient transparency** — Costco (like most retailers) doesn't surface NOVA processing scores, Nutri-Score, or additive detail on the product page or in-app — the kind of ingredient transparency apps like Yuka have made a mainstream expectation elsewhere. Open Food Facts already has strong Kirkland Signature/Costco-brand coverage (confirmed via direct lookups before this was built), so it's used as real, structured data rather than a rough keyword guess.
- **"Which warehouse did I visit, and when"** — genuinely easy to lose track of across a family or multiple regular locations; geo-fenced check-ins turn that into an automatic, verifiable log instead of a guess.
- **Crowdsourced price history** — a single shopper's receipts only cover so much. Every scan (across all users) quietly builds a shared price index over time, so price-matching and "what does this actually cost" get more reliable the more people use the app — the same crowdsourcing model that makes tools like Open Food Facts itself useful.

## Repo layout

**One git repo** rooted at `costco-app/`, containing two directories. (Earlier notes describing these as two independent repos were wrong — `git rev-parse --show-toplevel` from either directory returns the same root, and both share one `origin`.)

```
costco-app/
├── costco-mobile/    ← Expo + React Native app (this is what you build/run)
└── costco-backend/   ← Supabase migrations + Edge Functions
```

The directory must not contain a space in its path — React Native's iOS build scripts don't quote paths, so `Costco app/` broke the build and was renamed.

## Architecture

```
costco-mobile (Expo Router)  ──HTTPS──►  costco-backend (Supabase Edge Functions, Deno)
      │                                          │
      │ direct read/write (RLS-scoped)           │ service-role writes + external API calls
      ▼                                          ▼
                    Supabase PostgreSQL
```

Most reads (receipts, badges, profile) go straight from the app to Supabase via `@supabase/supabase-js`, protected by Row Level Security. Anything that needs a trusted external API call or a server-side secret — OCR, pricing, ingredient lookups, push — goes through an Edge Function instead.

## Tech stack

| Layer | Technology |
|---|---|
| Mobile (iOS / Android) | React Native + Expo (Expo Router) |
| Backend | Supabase Edge Functions (Deno / TypeScript) |
| Database | PostgreSQL via Supabase, no ORM (raw SQL migrations) |
| Auth | Supabase Auth (email/password with emailed codes, Sign in with Apple, Google Sign-In), enforced via Row Level Security |
| Push notifications | Expo Push API |
| Email | Brevo (auth codes via SMTP relay; price-drop alerts via API), sent from `noreply@everyday-labs.org` |
| Website | [everyday-labs.org/bulkmate](https://everyday-labs.org/bulkmate/) — GitHub Pages, repo `everyday-labs/everyday-labs.github.io` (product pages, privacy policy, support, feedback form, universal links) |
| Analytics, error tracking & session replay | PostHog |

## External APIs

No official Costco API exists, so pricing, ingredient, and OCR data are sourced from a mix of licensed, free/open, and crowdsourced sources. Every client lives in `costco-backend/supabase/functions/_shared/`, one file per API — see [`costco-backend/EXTERNAL_APIS.md`](./costco-backend/EXTERNAL_APIS.md) for the full detail on each (auth, caching, and exactly what happens when it fails).

| API | Used for | Called from | Auth | Cost |
|---|---|---|---|---|
| **Google Cloud Vision** (`DOCUMENT_TEXT_DETECTION`) | OCR on receipt photos — turns a captured image into raw text for the line-item parser | `ingest-receipt` | API key | Paid, per image |
| **RapidAPI — Costco Live Data** | Live Costco pricing, name, image, and rating for a scanned barcode or SKU | `barcode-lookup`, `price-match-check` | API key (header) | Paid, per request (cached 72h) |
| **Open Food Facts** | Primary ingredient classification — real NOVA processing group, Nutri-Score (A–E), detected additive E-codes, and high/low nutrient-level flags for the good/watch/avoid ingredient breakdown | `barcode-lookup` | None (descriptive User-Agent required) | Free |
| **USDA FoodData Central** | Fallback ingredient source when Open Food Facts has no match for a UPC — raw ingredient text only, classified with a weaker keyword heuristic | `barcode-lookup` | API key (query param) | Free |
| **Expo Push API** | Delivers the "price drop" push notification when a price-match alert fires | `price-match-check` | None (per-device push token) | Free |
| **Brevo** | Price-drop alert emails (SMS is built but paused for v1) | `price-match-check` | API key (header) | Free up to 300 emails/day |
| **PostHog** | Usage analytics, funnels, session replay (masked), and error tracking — mobile client events plus every Edge Function's caught exceptions, all in one project | Mobile app-wide + every Edge Function | Project token | Free tier |

Every client except Google Vision is built to **never throw** — a failure degrades gracefully (null/empty result, no ingredients card, no crash) rather than taking down the rest of the request. Vision is the one intentional exception: OCR is the entire input to the receipt pipeline, not an enrichment, so there's nothing sensible to fall back to.

## Data freshness — preseeded vs. hardcoded

⚠️ **Placeholder/reminder table** — a running list of data that either needs periodic re-seeding or lives as a hardcoded constant in code rather than a database row. Update this table (and the underlying data) as things drift.

| Data | Where it lives | Current state | Needs attention |
|---|---|---|---|
| Costco warehouse locations | Preseeded DB table (`warehouses`) | **723 locations live** — 511 USA, 74 Canada, 25 Mexico, 24 UK, 21 Japan, 18 South Korea, 16 Australia, plus Taiwan/Spain/France/others. Seeded via [`costco-backend/scripts/seed-warehouses-from-google-places.mjs`](./costco-backend/scripts/seed-warehouses-from-google-places.mjs) (Google Places), including 15 hand-seeded Bay Area rows with real Costco store numbers | **Re-run periodically** — Costco opens/closes warehouses and this script doesn't run itself. City-level query lists for large regions (Texas, California, Japan, UK, Mexico...) are best-effort, not guaranteed exhaustive — see the script's `SPLIT_REGIONS` map |
| Warehouse rarity (`tier`: Common/Rare/Legendary) | Derived column, computed at seed time from `google_rating` × `google_rating_count` | One-time snapshot, not live-updated | Ratings drift — re-run the seed script periodically to keep tiers current |
| Warehouse `warehouse_code` (real Costco store #) | Self-healing via receipt scans, see [`PARSER_DECISIONS.md`](./costco-backend/PARSER_DECISIONS.md) | Only the 15 original Bay Area rows have real codes today; every Google-Places-seeded row starts with a synthetic `GP-######` placeholder | No action needed — corrects itself automatically the first time a real receipt is scanned at that warehouse |
| Badges catalog | Preseeded DB table (`badges`) | 10 fixed badges | Add a new migration if the badge set ever expands |
| Additive database (ingredient good/watch/avoid flagging) | Hardcoded TypeScript (`costco-backend/supabase/functions/_shared/additiveDatabase.ts`) | ~25 curated E-codes | Requires a code deploy, not a DB update, to add/remove entries — worth a periodic review against new food-safety research |
| Fan tier star thresholds (1/3/6/11/21) | Hardcoded constant (`check-in` Edge Function) | Fixed | Requires a code deploy to change |
| Check-in GPS radius (50m) | Hardcoded constant (`check-in` Edge Function) | Fixed | Requires a code deploy to change |
| Price-match window (30 days) | Hardcoded constant (`price-match-check` Edge Function + cron query) | Matches Costco's real policy | Requires a code deploy if Costco's policy ever changes |
| Price cache TTL (72h) / ingredient cache TTL (30 days) | Hardcoded constants | Fixed | Tune only if data-freshness needs change |

## Getting started

```bash
# Clone the repo
git clone <repo-url>
cd costco-mobile

# Install dependencies
npm install --legacy-peer-deps

# Start the Expo dev server
npx expo start --clear
```

Scan the QR code in the **Expo Go** app on your phone to run it instantly.

You'll need a Supabase project with the migrations in `costco-backend/supabase/migrations/` applied, and the Edge Functions in `costco-backend/supabase/functions/` deployed.

### Tests

```bash
# Mobile (costco-mobile/)
npx tsc --noEmit
npm test                     # Jest unit tests
npm run check:contrast       # WCAG contrast check of the color palette

# Edge Functions (costco-backend/supabase/functions/) — needs Deno 2, or prefix with `npx`
deno check . && deno lint && deno test --allow-env
```

CI runs all of these on every pull request (`.github/workflows/ci.yml`). Device-only behaviour (camera, GPS, push, sign-in) is covered by the manual checklist in `TEST_PLAN.md`.

```bash
# Backend — the Supabase CLI works; deploys do not need the dashboard
supabase db push                    # apply migrations to the linked project
supabase functions deploy <name>    # deploy one Edge Function
```

### Building for a device or TestFlight

`eas.json` defines `development`, `preview`, and `production` profiles. Environment variables are
deliberately **not** committed there — `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
`POSTHOG_PROJECT_TOKEN`, and `POSTHOG_HOST` are read from `process.env` (the PostHog pair via
`app.config.js` → `extra`) and must be registered as EAS environment variables, or the build ships
with no Supabase URL and fails silently at runtime.

```bash
npx eas-cli build --platform ios --profile production --auto-submit
```

The first run needs an interactive Apple login to mint a distribution certificate; after that it
runs unattended. `submit.production.ios.ascAppId` is already set, so uploads need no prompts.

**Any change needs a redeploy to take effect.** Mobile JS is embedded in the native binary — a
Release build is not Metro-tethered, so a working-tree fix is invisible on device until you rebuild.
Edge Functions only change on `supabase functions deploy`.

## Gotchas & known limitations

Real traps hit while building this — worth knowing before you dig into the code or hit the same wall:

- **There is no official Costco API.** `api.costco.com` and other Costco-internal endpoints are session-cookie protected and will break without notice — the app never calls them. Pricing comes from a licensed third-party feed (RapidAPI) plus crowdsourced receipt scans instead, which means price/product coverage is inherently partial, not authoritative.
- **RapidAPI's search doesn't reliably match a raw scanned barcode.** Its `query` param expects a Costco item number or product name, not a 12–13 digit UPC/EAN — the exact format a camera scan produces. Confirmed against real UPCs where it returned zero results even though other sources resolved them fine. `barcode-lookup` handles this with a "partial hit" response (price sections just render empty) rather than a flat 404.
- **`fetch(file://...)` and `Blob` are both broken for local files on React Native.** Reading a captured photo/receipt image must go through `File(uri).bytes()` from `expo-file-system/next` — the web-standard patterns silently fail or behave differently here.
- **Expo SDK is pinned to 54**, matching the Expo Go client used for testing. `costco-mobile/AGENTS.md` currently links to v56 docs, which is stale — treat the pinned version in `package.json` as the source of truth, not that file.
- **Receipt images are uploaded to Storage *before* the receipt row exists.** Any path that doesn't end in a row owning that file has to delete it again, or the image is orphaned forever — invisible in the app and not covered by "delete this receipt". The non-obvious case is a *duplicate*: `ingest-receipt` returns the existing receipt's id, so the file just uploaded is referenced by nothing. This leaked 16 images before it was fixed, and orphans matter because a receipt photo carries the membership number.
- **Open Food Facts rate-limits anonymous requests more aggressively.** A generic `curl`/fetch with no `User-Agent` can get a 503-style "temporarily unavailable" response — always send a descriptive one (app name + contact), as `_shared/openFoodFacts.ts` does.
- **A few dark-mode color tokens invert on purpose, and that can bite you.** `executiveNavy` (and similar) intentionally flips per theme so it still reads correctly as *text* on a dark background — but that breaks it if reused as a solid opaque fill paired with hardcoded white text/icons (two real bugs shipped this way before being caught). Use the non-inverting `navySolid`/`darkSolid` tokens for solid-fill UI instead.
- **Check-in geofencing is foreground-only in v1** — no background location. The 50m radius check is enforced server-side in the `check-in` Edge Function; the client's GPS reading is never trusted on its own.

---

## About this project

Bulkmate is built and published by **[Everyday Labs](https://everyday-labs.org)**, an independent, non-commercial studio for small, useful, open-source apps.

It started as a practical fix for everyday annoyances: manually tracking Costco receipts, missing price-match windows, and forgetting which warehouse was visited.

**What this project is not:**
- A commercial product.
- Affiliated with, endorsed by, or partnered with Costco Wholesale Corporation in any way.

**What it is:**
- A useful tool, shared openly.
- Real software built to learn from, not a toy demo.
- Open source, so others can use it, learn from it, and contribute.

---

## Privacy

The app stores receipt images, the full OCR text extracted from them (which on a Costco receipt
includes your membership number), itemized purchase history, GPS coordinates for check-ins, and
masked analytics. See [`costco-mobile/docs/PRIVACY.md`](./costco-mobile/docs/PRIVACY.md) for exactly
what is collected, which third parties process it, and how to delete it.

---

## Disclaimer

This app is an **independent, community-built tool** and is **not affiliated with, endorsed by, or connected to Costco Wholesale Corporation** in any way. Costco®, Kirkland Signature®, and all related marks are trademarks of Costco Wholesale Corporation.

Pricing and inventory data is sourced from third-party APIs and crowdsourced receipt scans — not from Costco's internal systems. Data accuracy is not guaranteed. Use this app to assist your own decisions, not as a source of financial truth.

**This software is provided "as is," without warranty of any kind.** Everyday Labs accepts no liability for decisions made based on information displayed in this app. See the [LICENSE](./LICENSE) for full terms.

---

## License

MIT — free to use, modify, and distribute. © 2026 Everyday Labs. See [LICENSE](./LICENSE).

---

## Contributing

PRs and issues welcome. If you hit a bug or have an idea, open an issue and let's talk about it.
