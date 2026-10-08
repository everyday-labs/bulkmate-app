# Security policy

## Reporting a vulnerability

Please **don't open a public issue** for security problems.

- Preferred: GitHub's private reporting — **Security → Report a vulnerability** on this repository.
- Or email **hello@everyday-labs.org** with "Security" in the subject.

Include what you found, how to reproduce it, and the impact you expect. You'll get an
acknowledgement within 3 business days and a status update within 10. Please give us a
reasonable chance to fix the issue before disclosing it publicly; we're happy to credit you.

## Supported versions

Only the latest release of Bulkmate (the App Store / TestFlight build built from `main`)
and the currently deployed Supabase Edge Functions receive security fixes.

## Scope

In scope: the Bulkmate mobile app, the Edge Functions in `costco-backend/`, and the
Supabase database policies (RLS) in `costco-backend/supabase/migrations/`.

Out of scope: third-party services Bulkmate depends on (Supabase, Google Cloud Vision,
RapidAPI, Open Food Facts, Brevo, PostHog, Expo) — report those to their vendors.

## How this repo is protected

Secret scanning (gitleaks in git hooks and CI, plus GitHub push protection), CodeQL,
dependency review, Dependabot security updates and OpenSSF Scorecard run on every change —
see the "Quality checks & tests" section of the README.
