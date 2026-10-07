# Bulkmate — Privacy Policy

**Last updated: 6 October 2026**

Bulkmate is an independent app by **Everyday Labs** that helps you track Costco receipts, catch price-match
windows, and earn rewards for warehouse visits. It is not affiliated with, endorsed by, or
sponsored by Costco Wholesale Corporation.

This policy explains exactly what the app collects, where it goes, and how to get rid of it.
It is written to be specific rather than reassuring — if something is stored, it is listed here.

## Who is responsible

Bulkmate is published by **Everyday Labs**, an independent studio, which is responsible for
the data described in this policy. For any privacy question or request, contact
**balajic0623@gmail.com**.

## What is collected

### Account details
- **Email address** — required to create an account. If you use Sign in with Apple and choose
  *Hide My Email*, only Apple's private relay address is received; your real address is not.
- **Name** — if you sign in with Google or Apple, the name on that account is saved as your
  first and last name (Apple only shares it on your first sign-in, and only if you allow it).
  You can change or clear it at any time on the Edit Profile screen. Email sign-ups start
  with no name.
- **Phone number** — optional, only if you enter it on the Edit Profile screen. Nothing in the
  app uses it yet.

### Receipts
- **The receipt photo you take**, stored as an image file.
- **The full text extracted from that photo**, stored alongside it. Be aware this raw text
  includes everything printed on the receipt — which on a Costco receipt includes your
  **membership number**.
- **Itemized purchase data**: item descriptions, SKUs, unit prices, quantities, discounts,
  subtotal, tax, grand total, transaction number, transaction date, and warehouse.

Purchase history is sensitive. It reveals what you buy, how much you spend, and how often.
It is stored so the app can show your spending analytics and detect price drops. It is never
sold, and it is never shared with advertisers.

### Location
- **GPS coordinates** are read *only* at the moment you tap to check in, and are stored with
  the check-in record along with your distance from the warehouse.
- Location is **foreground-only**. The app cannot and does not track you in the background.

### Notifications
- **A push notification token** for your device, if you allow notifications. Used to alert you
  about price-match opportunities.

### Usage and diagnostics
- **Analytics events** (screens opened, actions taken) and **crash/error reports**.
- **Session replay**, which records how you move through the app. Text inputs and images are
  **masked** before leaving your device, so receipt contents and prices are not captured in
  replays.

## Who your data is shared with

Bulkmate does not sell your data. It is processed by these services:

| Service | What it receives | Why |
|---|---|---|
| **Supabase** | All account, receipt, check-in and profile data | Database, authentication, and file storage — this is where the app's data lives |
| **Google Sign-In / Sign in with Apple** | Only if you choose them: they confirm your identity and share your email and name with the app | Signing in without a password |
| **Google (Gmail)** | Your email address and a one-time code | Delivering sign-up confirmation and password reset emails |
| **Google Cloud Vision** | Your receipt images | Optical character recognition, to read items and prices off the photo |
| **PostHog** | Usage events, error reports, masked session replays | Understanding how the app is used and diagnosing failures |
| **Expo Push / Apple APNs** | Your push token and notification contents | Delivering push notifications |
| **RapidAPI, Open Food Facts, USDA FoodData Central** | Product SKUs and barcodes only — no personal data, no account identifier | Looking up current prices and ingredient information |

Data may also be disclosed if required by law.

## How long it is kept

Data is kept until you delete it. Deleting a receipt in the app removes its image, its
extracted text, and its line items.

To delete your entire account, open **Profile → Delete Account**. This permanently removes your
account, every receipt and its scanned image, all items and price alerts, your check-ins, stars
and badges. It cannot be undone.

If you would rather it be handled for you, email **balajic0623@gmail.com**.

## Your choices

- **Location** — decline the permission, or revoke it in iOS Settings. Only check-ins stop
  working; everything else is unaffected.
- **Camera** — decline the permission. Receipt and barcode scanning stop working.
- **Notifications** — decline or revoke at any time in iOS Settings.
- **Your receipts** — delete any of them individually, at any time, from the app.

## Children

Bulkmate is not directed at children under 13 and does not knowingly collect their data.

## Security

Data is transmitted over HTTPS and stored in Supabase with row-level security, so your records
are only readable by your own account. No system is perfectly secure, and no guarantee of
absolute security is made.

## Beta software

Bulkmate is currently distributed as a beta for testing. It may contain bugs, and features may
change or be removed. Please do not rely on it as your only record of a purchase.

## Changes to this policy

If this policy changes materially, the "Last updated" date will change and, where the change is
significant, you will be notified in the app.
