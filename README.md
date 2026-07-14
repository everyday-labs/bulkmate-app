# Costco Warehouse Companion

An open-source, gamified Costco membership companion app for iOS, Android, and Web. Built as a personal side project to solve real pain points — receipt tracking, price-match alerts, and making warehouse visits a little more fun.

---

## What it does

- **Receipt OCR** — Scan a physical Costco receipt with your camera. The app parses every line item and stores it automatically.
- **Sliding-window price matching** — If a price drops within 30 days of your purchase, you get a push notification with the refund amount.
- **Geo-fenced check-ins** — Check in when you're physically at a warehouse and earn stars toward your fan tier.
- **Badge engine** — Unlock badges for milestones: first visit, five check-ins, rare warehouses, and more.
- **Spend analytics** — Monthly spend chart, top items by cost, in-store savings vs. price-match savings breakdown.
- **Product barcode scanner** — Scan any product barcode for pricing, reviews, and community price history.

## Tech stack

| Layer | Technology |
|---|---|
| Mobile (iOS / Android) | React Native + Expo (Expo Router) |
| Backend | Supabase Edge Functions (Deno / TypeScript) |
| Database | PostgreSQL via Supabase |
| Push notifications | Expo Push API |
| Error tracking | Sentry |

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

---

## About this project

I go by **Tinker** — a tech enthusiast and developer who builds side projects in my spare time. (Yes, named after the Dota 2 hero. Seemed fitting.) This app started as a personal tool: I was tired of manually tracking Costco receipts, missing price-match windows, and forgetting which warehouse I'd visited. So I built something to fix that.

I share projects like this publicly because I believe in building tools that solve real problems and letting others use, learn from, and improve them.

**What I'm not doing:**
- This is not monetized and I have no plans to monetize it.
- This is not a commercial product.
- I am not affiliated with, endorsed by, or partnered with Costco Wholesale Corporation in any way.

**What I am doing:**
- Building something useful for myself and sharing it.
- Learning by building real things, not toy demos.
- Open-sourcing everything so others can benefit and contribute.

---

## Disclaimer

This app is an **independent, community-built tool** and is **not affiliated with, endorsed by, or connected to Costco Wholesale Corporation** in any way. Costco®, Kirkland Signature®, and all related marks are trademarks of Costco Wholesale Corporation.

Pricing and inventory data is sourced from third-party APIs and crowdsourced receipt scans — not from Costco's internal systems. Data accuracy is not guaranteed. Use this app to assist your own decisions, not as a source of financial truth.

**This software is provided "as is," without warranty of any kind.** The author accepts no liability for decisions made based on information displayed in this app. See the [LICENSE](./LICENSE) for full terms.

---

## License

MIT — free to use, modify, and distribute. See [LICENSE](./LICENSE).

---

## Contributing

PRs and issues welcome. If you hit a bug or have an idea, open an issue and let's talk about it.
