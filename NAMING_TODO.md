# Naming consistency checklist — Bulkmate / Everyday Labs / Tinker

Created 2026-10-06. Goal: every place a user, reviewer, or service sees a name uses the right
one, consistently. Work through it top to bottom; tick items as you go.

## The rules (decide once, apply everywhere)

| Name | Use it for | Examples |
|---|---|---|
| **Bulkmate** | The app itself — anything the user sees as "the product" | Home screen icon name, email sender name, push notifications, App Store app name |
| **Everyday Labs** | The publisher — legal, copyright, "who is responsible" | `© 2026 Everyday Labs`, privacy policy, terms, App Store copyright, GitHub org, website |
| ~~Tinker~~ | **Retired from public copy (2026-10-06).** All public text is third person, as Everyday Labs | — |
| **noreply@everyday-labs.org** | Sender address for all outgoing email (send-only, Brevo, DKIM + DMARC) | Supabase Auth SMTP sender, price-drop emails (`_shared/brevo.ts`) |
| **hello@everyday-labs.org** | The one public contact address (until `hello@` forwarding exists) | Privacy policy, support page, store listings, OAuth consent screen |

**Never rename** (would break things): bundle ID `com.twonk0609.bulkmate`, Expo `slug: costco-app`,
EAS owner `twonk0609s-team`, ASC app id `6800910077`. These are invisible to users.

Open decision: should user-facing copy say "Bulkmate by Everyday Labs" in one consistent form?
Pick one pattern (e.g. "Bulkmate by Everyday Labs") and use it in emails, website, and store listing.

---

## 1. In the repo

- [ ] **Login tagline** says "Warehouse Companion" (`costco-mobile/app/(auth)/login.tsx`) — leftover
      from the "Costco Companion" days. Keep, or replace with something on-brand (register screen
      uses "Start tracking your savings").
- [ ] **Push notification copy** (`price-match-check/index.ts:376`) — title is "Price Drop — You may
      be owed $X". iOS already shows "Bulkmate" as the app name above it; confirm wording.
- [x] **CLAUDE.md Release build commands** still reference `costcomobile.xcworkspace` / scheme
      `costcomobile` / `costcomobile.app` — the iOS project is now `Bulkmate.xcworkspace` / scheme
      `Bulkmate`. Fix the commands.
- [ ] `costco-backend/scripts/generate-apple-client-secret.mjs` example comment uses the old client
      id `com.twonk0609.costco-app` → update to `com.twonk0609.bulkmate`.
- [ ] Design docs still titled "Costco Companion" (`docs/design-system/animation-plan-2026-08-04.md`,
      `styles.reference.css`) — historical; either leave with a "renamed" note or update titles.
- [ ] `costco-mobile/package.json` `"name": "costco-mobile"` — internal only; leave unless renaming
      the folders too.
- [ ] Repo/folder names (`costco-app`, `costco-mobile`, `costco-backend`) — internal, but public if
      the repo is open source. Decide whether to rename alongside the GitHub org move (step 6).
- [ ] Profile → About card (`app/(tabs)/profile.tsx`): now "Everyday Labs" (third person) + footer
      "© 2026 Everyday Labs" — check it reads well on device (light + dark mode).
- [ ] README, APP_OVERVIEW, PRIVACY.md, LICENSE — reread together once the website exists; add the
      website URL and make the "by Everyday Labs" phrasing match the pattern chosen above.
- [ ] Final sweep: `git grep -niE "costco companion|tinker|everyday labs|bulkmate|\bI\b|\bmy\b"` and eyeball
      every hit against the rules table.

## 2. Emails (Supabase → Authentication → Emails)

- [x] **SMTP sender name** = `Bulkmate` (set) — or "Bulkmate by Everyday Labs"? Pick per the pattern.
- [x] **SMTP port** — was `453` (typo), fixed to `465` 2026-10-06; sign-up test passed (HTTP 200, email sent).
- [x] **Confirm sign up** template — repo version has the Everyday Labs footer; re-paste
      `costco-backend/supabase/templates/confirm-signup.html`. Subject → `Your Bulkmate code: {{ .Token }}`.
- [x] **Reset password** template — re-paste `templates/reset-password.html`; subject
      `Your Bulkmate password reset code`.
- [x] **Other templates still on Supabase defaults** — unused by the app, but three can still be
      triggered (Magic Link by anyone with the anon key; Change Email + Reauthentication by any
      signed-in user via the API; Invite is service-role only). Branded code-based versions written
      2026-10-07 and pasted into the dashboard (template body + subject):
  - [x] Magic Link ← `templates/magic-link.html`, subject `Your Bulkmate sign-in code: {{ .Token }}`
  - [x] Change Email Address ← `templates/change-email.html`, subject `Confirm your new Bulkmate email`
  - [x] Invite User ← `templates/invite.html`, subject `You're invited to Bulkmate`
  - [x] Reauthentication ← `templates/reauthentication.html`, subject `Your Bulkmate confirmation code`
- [x] **Site URL** — set to `bulkmate://` 2026-10-06 (could point at everyday-labs.org instead).
- [ ] **Gmail account display name** for hello@everyday-labs.org — shows in some clients next to the
      address. Set it to match (Gmail → Settings → Accounts → "Send mail as").
- [x] **Sign in with Apple private relay** — users who pick "Hide My Email" get emails at
      `@privaterelay.appleid.com`, and Apple **drops** mail from senders not registered in
      Apple Developer → Certificates, IDs & Profiles → Services → *Sign in with Apple for Email
      Communication*. Domain `everyday-labs.org` registered 2026-10-07, SPF green (needs
      `include:spf.brevo.com` in the SPF record — keep it if SPF is ever edited).
  - [ ] Test: Apple sign-in with Hide My Email → send a Brevo test email to that user's relay
        address (Supabase → Authentication → Users) → confirm it arrives.
- [ ] Send yourself one of each email and check sender, subject, body, footer on phone + desktop.

## 3. Apple

- [ ] **App Store Connect → App Information**: name `Bulkmate`, subtitle, category.
- [ ] **Copyright** field (App Store → version page): `© 2026 Everyday Labs`.
- [ ] **Seller / developer name**: comes from the Developer Program enrollment. Individual
      enrollment shows your legal name; "Everyday Labs" needs an organization enrollment (legal
      entity + D-U-N-S). Decide whether that matters to you — it's fine to ship as an individual.
- [ ] **Privacy Policy URL** + **Support URL** → website pages once live.
- [ ] **App Review contact info** — name/email consistent with the above.
- [ ] Apple Developer → Identifiers: App ID description for `com.twonk0609.bulkmate` reads "Bulkmate";
      old `com.twonk0609.costco-app` App ID / Services ID — rename description or remove if unused.
- [ ] **Supabase Apple provider Client IDs** must include `com.twonk0609.bulkmate` (pending — Apple
      sign-in fails without it).

## 4. Google

- [ ] **Google Cloud project name** — "Bulkmate" (or "Everyday Labs" if it'll host more apps).
- [ ] **Google Auth Platform → Branding**: app name `Bulkmate`, logo, support email, developer
      contact, app home page + privacy policy URL (website), authorized domain. Required before
      publishing out of "Testing".
- [ ] **OAuth clients** (iOS, Web) — names like "Bulkmate iOS" / "Bulkmate Supabase" for clarity.
- [ ] Web client **redirect URI** `https://lylpdnqrguzxoompllsa.supabase.co/auth/v1/callback` —
      was returning `redirect_uri_mismatch`; add it.

## 5. Other services

- [x] **Claude artifacts** — all 11 Bulkmate artifacts renamed from "Costco Companion" and updated
      2026-10-06. Note: the 5 walkthrough artifacts are shared by link with a **pinned version**;
      move the share pin to the latest version in each one's Share menu or viewers keep the old copy.

- [ ] **Supabase** project name (dashboard) — "Bulkmate".
- [ ] **PostHog** organization → "Everyday Labs", project → "Bulkmate".
- [ ] **Expo / EAS** project display name → "Bulkmate" (slug stays `costco-app`).
- [ ] **RapidAPI** app name → "Bulkmate".
- [x] **Open Food Facts** User-Agent `Bulkmate/1.0 (Everyday Labs; hello@everyday-labs.org)` —
      deployed 2026-10-06.
- [ ] **USDA FoodData Central** API key registration — app/org name.

## 6. Web presence (after the site exists)

- [x] GitHub org `everyday-labs` — display name, description (avatar + website link still open).
- [x] Site repo `everyday-labs/everyday-labs.github.io` — home, `/bulkmate` (5 product pages from the
      Claude walkthrough), `/bulkmate/privacy`, `/bulkmate/support`, `/bulkmate/feedback` (2026-10-06).
- [ ] Transfer `balajic0623/costco-app` → `everyday-labs/` (maybe rename to `bulkmate`);
      `git remote set-url origin …` locally.
- [x] Domain `everyday-labs.org` bought 2026-10-06 → DNS, HTTPS, verified domain done. Still open:
      `hello@` forwarding → then switch the contact email to it and update every place above that
      lists hello@everyday-labs.org.
- [x] **Brevo sending domain** — SPF (`v=spf1 include:_spf.mx.cloudflare.net include:spf.brevo.com ~all`, 2026-10-07) + DKIM (`brevo1/brevo2._domainkey` CNAMEs) + DMARC
      (`_dmarc` TXT `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com`) live 2026-10-06; test
      email received. Later: move to `p=quarantine` after ~2 weeks of clean Brevo DMARC reports —
      but not if Gmail will send as `hello@everyday-labs.org` (no domain DKIM → would fail).
- [ ] Link the website from: README, Profile → About card, App Store listing, Google consent screen,
      privacy policy, email template footers.
