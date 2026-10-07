# App Store submission — Bulkmate

Draft of everything App Store Connect asks for, written 2026-10-07. Paste from here; when a field
changes in App Store Connect, change it here too. The **App Privacy** answers must match
`costco-mobile/docs/PRIVACY.md`. If one changes, change the other.

Enrollment: **individual** (decided 2026-10-07). The store shows the developer's legal name as the
seller; "Everyday Labs" appears as the copyright holder and in the description, not as the seller.

---

## App Information

| Field | Value |
|---|---|
| Name (≤30) | `Bulkmate` |
| Subtitle (≤30) | `Receipts & price-drop alerts` (28) |
| Bundle ID | `com.twonk0609.bulkmate` (never rename) |
| Primary category | Shopping |
| Secondary category | Finance |
| Content rights | **Yes**, it contains third-party content: product data from Open Food Facts (ODbL), USDA FoodData Central and RapidAPI price lookups. All are used under their terms. |
| Age rating | 4+ (no objectionable content, no unrestricted web access, no gambling, no user-to-user messaging) |

Keep "Costco" out of the name, subtitle and keywords. Trademarks in those fields are a common
rejection (guidelines 2.3.7 / 5.2.1). Factual use in the description is fine, with the
not-affiliated line.

## Pricing and Availability

- Price: **Free**. No in-app purchases, no ads.
- Availability: start with the **United States**. The receipt parser and warehouse list are tuned to US
  receipts; add countries once other receipt layouts are covered.

## Version page (1.0)

**Promotional text** (≤170, editable without review)

> Snap a receipt and Bulkmate watches every item for 30 days. If a price drops, you get a push and an email with how much you could get back.

**Description** (≤4000)

> Bulkmate is a free companion app for warehouse-club shoppers. Snap your receipt, and it keeps track of what you bought, watches for price drops, and turns your warehouse visits into a little collection game.
>
> NEVER MISS A PRICE ADJUSTMENT
> Costco offers a price adjustment if an item's price drops within 30 days of purchase. Bulkmate watches every item on your receipts for those 30 days. When a price drops, you get a push notification and an email with the amount you could get back. Bring your receipt to the membership counter.
>
> RECEIPTS, ORGANIZED
> • Scan a paper receipt with your camera. Every line item is read and saved automatically.
> • Full purchase history, matched to the warehouse you shopped at.
> • Fix any line the scanner misread with a tap.
>
> SCAN ANY PRODUCT
> • Scan a barcode to see pricing, community price history and reviews.
> • See a good / watch / avoid ingredient breakdown, with processing level (NOVA) and Nutri-Score when available.
>
> MAKE IT A GAME
> • Check in at warehouses to earn stars and climb five fan tiers.
> • Unlock badges for milestones like your first visit or a rare warehouse.
>
> SEE WHERE THE MONEY GOES
> • Monthly spending chart, your top items by cost, and how much you've saved in store and through price adjustments.
>
> YOUR DATA, YOUR CALL
> • No ads, nothing sold. The privacy policy lists exactly what's collected.
> • Location is used only when you tap to check in, never in the background.
> • Delete any receipt, or your whole account, from inside the app.
>
> Sign in with Apple, Google, or email.
>
> Bulkmate is an independent, open-source app by Everyday Labs. It is not affiliated with, endorsed by, or sponsored by Costco Wholesale Corporation. "Costco" and "Kirkland Signature" are trademarks of Costco Wholesale Corporation, used only to describe the receipts this app works with.

**Keywords** (≤100, comma-separated, no spaces; name and subtitle words are already indexed)

```
scanner,price adjustment,price match,warehouse,bulk,savings,barcode,ingredients,grocery,budget
```
(94 characters)

| Field | Value |
|---|---|
| Support URL | `https://everyday-labs.org/bulkmate/support/` |
| Marketing URL | `https://everyday-labs.org/bulkmate/` |
| Privacy Policy URL (App Information) | `https://everyday-labs.org/bulkmate/privacy/` |
| Copyright | `© 2026 Everyday Labs` |

### App Review Information

- **Sign-in required → demo account needed.** Create a dedicated review account, e.g.
  `appreview@everyday-labs.org`, that already has 2–3 sample receipts and one price alert, so the reviewer
  can see the main features without a Costco receipt. Put its email and password only in App
  Store Connect, never in this repo.
- Contact: your legal name, phone, `hello@everyday-labs.org`.
- Notes for the reviewer:

> Bulkmate reads Costco receipts and alerts members to price drops within Costco's 30-day price-adjustment window. The demo account is pre-loaded with sample receipts. Location is requested only when the user taps "Check in" and confirms they are at a warehouse. Check-ins can also be earned by scanning that trip's receipt. The camera is used for receipt and barcode scanning. Account deletion: Profile → Delete Account. Bulkmate is not affiliated with Costco Wholesale Corporation.

### Export compliance

`ITSAppUsesNonExemptEncryption = false` is already in `app.json`, so builds skip the question. The app
only uses HTTPS.

---

## App Privacy ("nutrition label")

**Data used to track you: No.** There's no ad SDK, no IDFA, and no App Tracking Transparency
prompt, and no data is shared with data brokers.

**Data linked to you.** Every type below is tied to the user's account, including analytics: PostHog
is identified by user ID (not email, as of 2026-10-07).

| Apple data type | Collected because | Purposes to tick |
|---|---|---|
| Contact Info → **Name** | Google/Apple sign-in, or Edit Profile | App Functionality |
| Contact Info → **Email Address** | Account, sign-in codes, price-drop emails | App Functionality |
| Contact Info → **Phone Number** | Optional field on Edit Profile | App Functionality |
| Purchases → **Purchase History** | Itemized receipts, for history, analytics screens and price-drop detection | App Functionality |
| Location → **Precise Location** | GPS at the moment of a check-in, stored with the check-in | App Functionality |
| User Content → **Photos or Videos** | Receipt photos | App Functionality |
| User Content → **Other User Content** | Full text extracted from receipts (includes the membership number) | App Functionality |
| Identifiers → **User ID** | Account ID; also the PostHog person ID | App Functionality, Analytics |
| Usage Data → **Product Interaction** | PostHog events and masked session replays | Analytics |
| Diagnostics → **Crash Data** | PostHog error/crash reports | App Functionality, Analytics |
| Diagnostics → **Other Diagnostic Data** | Error details captured with events | App Functionality, Analytics |

Not collected: Health & Fitness, Financial Info (no card or bank data; purchase *totals* are
under Purchase History), Contacts, Browsing/Search History, Sensitive Info, Audio, Gameplay Content,
Device ID (no advertising identifier; the push token is used only to deliver notifications).

---

## Before submitting

- [ ] Demo review account created and loaded with sample receipts
- [ ] App Information, Pricing and Availability, and the version page filled in from above
- [ ] App Privacy answered from the table above
- [ ] Screenshots: 6.9" iPhone (required) — Home, receipt scan, price-drop alert, product scan, rewards
- [ ] Build uploaded via EAS (`eas build -p ios --profile production`, then `eas submit -p ios`)
- [ ] Release testing finished (`TEST_PLAN.md`)
