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
| **hello@everyday-labs.org** | The one public contact address (Cloudflare Email Routing → personal Gmail) | Privacy policy, support/feedback pages, site `_config.yml` `email`, store listings, OAuth consent screen |

**Never rename** (would break things): bundle ID `com.twonk0609.bulkmate`, Expo `slug: costco-app`,
EAS owner `twonk0609s-team`, ASC app id `6800910077`. These are invisible to users.

Decided 2026-10-07: the pattern is **"Bulkmate by Everyday Labs"** (already used by the unsubscribe
page footer, README, privacy policy and the About card's "an independent app by Everyday Labs").
Use it in emails, website, and store listing.

---

## 1. In the repo

- [x] **Login tagline** "Warehouse Companion" → "Never miss a price drop"
      (`costco-mobile/app/(auth)/login.tsx`, 2026-10-07; register keeps "Start tracking your savings").
- [x] **Push notification copy** (`price-match-check/index.ts`) — title now "Price drop: you could
      get $X back", matching the email subject (2026-10-07). iOS shows "Bulkmate" above it.
      Takes effect once `price-match-check` is redeployed.
- [x] **CLAUDE.md Release build commands** still reference `costcomobile.xcworkspace` / scheme
      `costcomobile` / `costcomobile.app` — the iOS project is now `Bulkmate.xcworkspace` / scheme
      `Bulkmate`. Fix the commands.
- [x] `costco-backend/scripts/generate-apple-client-secret.mjs` example comment → `com.twonk0609.bulkmate`.
- [x] Design docs (`docs/design-system/animation-plan-2026-08-04.md`, `styles.reference.css`) —
      titles now "Bulkmate", with a "formerly Costco Companion" note (2026-10-07).
- [x] `costco-mobile/package.json` `"name": "costco-mobile"` — internal only; decided to leave it
      (2026-10-07) unless the folders get renamed with the repo transfer.
- [ ] Repo/folder names (`costco-app`, `costco-mobile`, `costco-backend`) — internal, but public if
      the repo is open source. Decide alongside the GitHub org move (step 6).
- [ ] Profile → About card (`app/(tabs)/profile.tsx`): now "Everyday Labs" (third person) + footer
      "© 2026 Everyday Labs", plus an `everyday-labs.org ↗` pill linking to the Bulkmate page
      (2026-10-07). Still to do: check it on device (light + dark mode).
- [x] README, APP_OVERVIEW, PRIVACY.md, LICENSE — reread 2026-10-07: README links the website, all
      four use "by Everyday Labs" / "© 2026 Everyday Labs"; APP_OVERVIEW push example updated.
- [x] Final sweep: `git grep -niE "costco companion|tinker|everyday labs|bulkmate|\bI\b|\bmy\b"` and eyeball
      every hit against the rules table. Done 2026-10-07: no old names in app/backend code; the
      receipt-success "I'm unable to find…" prompt → "Bulkmate was unable to find…". Remaining
      "Costco Companion" mentions are the deliberate rename notes.

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
- [x] ~~**Gmail account display name**~~ — moot since 2026-10-07: the Gmail address is no longer
      public (contact is `hello@everyday-labs.org`).
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
- [ ] **Privacy Policy URL** + **Support URL** → `https://everyday-labs.org/bulkmate/privacy/` and
      `https://everyday-labs.org/bulkmate/support/` (both live 2026-10-07).
- [ ] **App Review contact info** — name/email consistent with the above.
- [ ] Apple Developer → Identifiers: App ID description for `com.twonk0609.bulkmate` reads "Bulkmate";
      old `com.twonk0609.costco-app` App ID / Services ID — rename description or remove if unused.
- [x] **Supabase Apple provider Client IDs** include `com.twonk0609.bulkmate` (confirmed in the
      dashboard 2026-10-07; Apple sign-in fails without it).

## 4. Google

- [x] **Google Cloud project name** — renamed "costco app" → "Bulkmate" (2026-10-07; display name
      only, project ID unchanged).
- [ ] **Google Auth Platform → Branding**: app name `Bulkmate`, logo, support email, developer
      contact, app home page + privacy policy URL (website), authorized domain. Required before
      publishing out of "Testing". User support email must be your Google account (Gmail) or a
      Google Group you own — `hello@` is rejected there; use `hello@everyday-labs.org` for
      developer contact. Home `https://everyday-labs.org/bulkmate/`, privacy
      `https://everyday-labs.org/bulkmate/privacy/`, authorized domain `everyday-labs.org`.
- [ ] **OAuth clients** (iOS, Web) — names like "Bulkmate iOS" / "Bulkmate Supabase" for clarity.
- [x] Web client **redirect URI** `https://lylpdnqrguzxoompllsa.supabase.co/auth/v1/callback` —
      added 2026-10-07 (was returning `redirect_uri_mismatch`). Web client ID matches Supabase's
      Google provider.

## 5. Other services

- [x] **Claude artifacts** — all 11 Bulkmate artifacts renamed from "Costco Companion" and updated
      2026-10-06. Note: the 5 walkthrough artifacts are shared by link with a **pinned version**;
      move the share pin to the latest version in each one's Share menu or viewers keep the old copy.

- [x] **Supabase** project name (dashboard) — "Bulkmate" (2026-10-07; CLI shows `name=Bulkmate`).
- [x] **PostHog** organization → "Everyday Labs", project → "Bulkmate" (2026-10-07).
- [x] **Expo / EAS** project display name → "Bulkmate" (slug stays `costco-app`). Checked
      2026-10-07: comes from `app.json` `expo.name`, already "Bulkmate"; nothing to change.
- [ ] **RapidAPI** app name → "Bulkmate".
- [x] **Open Food Facts** User-Agent `Bulkmate/1.0 (Everyday Labs; hello@everyday-labs.org)` —
      contact switched + `barcode-lookup` redeployed 2026-10-07.
- [ ] **USDA FoodData Central** API key registration — app/org name.

## 6. Web presence (after the site exists)

- [x] GitHub org `everyday-labs` — display name, description (avatar + website link still open).
- [x] Site repo `everyday-labs/everyday-labs.github.io` — home, `/bulkmate` (5 product pages from the
      Claude walkthrough), `/bulkmate/privacy`, `/bulkmate/support`, `/bulkmate/feedback` (2026-10-06).
- [ ] Transfer `balajic0623/costco-app` → `everyday-labs/` (maybe rename to `bulkmate`);
      `git remote set-url origin …` locally. GitHub side done 2026-10-07: now
      `everyday-labs/bulkmate-app`. Still to do: `git remote set-url origin
      https://github.com/everyday-labs/bulkmate-app.git` in the local checkout.
- [x] Domain `everyday-labs.org` bought 2026-10-06 → DNS, HTTPS, verified domain done.
      `hello@` forwarding (Cloudflare Email Routing) verified 2026-10-07; contact email switched to it
      in PRIVACY.md (both copies), site `_config.yml` + feedback page, OFF User-Agent. Still to
      change by hand: App Store Connect contact/review info, Google consent screen *developer*
      contact (the *user support* email must stay the Gmail account — see section 4).
- [x] **Brevo sending domain** — SPF (`v=spf1 include:_spf.mx.cloudflare.net include:spf.brevo.com ~all`, 2026-10-07) + DKIM (`brevo1/brevo2._domainkey` CNAMEs) + DMARC
      (`_dmarc` TXT `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com`) live 2026-10-06; test
      email received. Later: move to `p=quarantine` after ~2 weeks of clean Brevo DMARC reports —
      but not if Gmail will send as `hello@everyday-labs.org` (no domain DKIM → would fail).
- [ ] Link the website from: README, Profile → About card, App Store listing, Google consent screen,
      privacy policy, email template footers. Done 2026-10-07: README, About card (`everyday-labs.org ↗`
      pill), privacy policy (app + site copies), price-drop email footer, and all 6 auth templates in
      `costco-backend/supabase/templates/` — **re-paste those 6 into Supabase → Authentication →
      Emails** for the link to go live. Still to do: App Store listing, Google consent screen.
