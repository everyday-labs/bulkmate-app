// PostHog — captures backend events and exceptions from Edge Functions, so
// server-side failures (OCR errors, check-in/price-match 500s, cron sweep
// issues) land in the same PostHog project as the mobile app's events and
// crashes, instead of only living in Supabase function logs.
//
// Uses PostHog's HTTP capture endpoint directly via fetch, rather than the
// posthog-node SDK — posthog-node buffers events in memory and flushes on
// an interval/shutdown, which is a bad fit for a Deno Edge Function: the
// isolate can be frozen the instant a response is returned, silently
// dropping anything still queued. A single awaited fetch per event avoids
// that entirely, at the cost of one extra request per capture.
//
// Requires POSTHOG_PROJECT_TOKEN and POSTHOG_HOST as Supabase Edge Function
// secrets (same values as costco-mobile's .env) — set manually via the
// Supabase dashboard, same as every other secret in this project (CLI auth
// is broken, see CLAUDE.md).

const projectToken = Deno.env.get('POSTHOG_PROJECT_TOKEN');
const host = Deno.env.get('POSTHOG_HOST');
// Analytics must never hold up the response it's reporting on.
const TIMEOUT_MS = 5_000;

type EventProperties = Record<string, unknown>;

/**
 * Captures a single named event. Pass the Supabase user id as `distinctId`
 * when the request is user-scoped, so backend events line up with the same
 * person's mobile-app events; falls back to a generic id for unattended
 * work (e.g. the price-match-check cron sweep) so those still show up.
 *
 * Never throws — PostHog being unreachable must never fail the request or
 * job it's instrumenting.
 */
export async function capturePostHogEvent(
  event: string,
  properties: EventProperties = {},
  distinctId?: string,
): Promise<void> {
  if (!projectToken || !host) return;
  try {
    const res = await fetch(`${host}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: projectToken,
        event,
        distinct_id: distinctId ?? 'costco-backend',
        properties: { ...properties, $lib: 'costco-backend-edge-function' },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`PostHog capture "${event}" returned ${res.status}:`, await res.text());
    }
  } catch (err) {
    console.warn(`PostHog capture "${event}" failed:`, err);
  }
}

/**
 * Captures an exception in the shape PostHog's Error Tracking product
 * expects ($exception event + $exception_list), so backend failures show
 * up alongside mobile crashes in the same Error Tracking view. `context`
 * should always include which function threw, plus whatever request-scoped
 * detail helps triage (e.g. sku, receiptId).
 */
export async function capturePostHogException(
  error: unknown,
  context: { functionName: string; [key: string]: unknown },
  distinctId?: string,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const type = error instanceof Error ? error.name : 'Error';
  const stack = error instanceof Error ? error.stack : undefined;

  await capturePostHogEvent(
    '$exception',
    {
      $exception_message: message,
      $exception_type: type,
      $exception_list: [
        {
          type,
          value: message,
          mechanism: { handled: true, synthetic: false },
        },
      ],
      $exception_stack_trace_raw: stack,
      ...context,
    },
    distinctId,
  );
}
