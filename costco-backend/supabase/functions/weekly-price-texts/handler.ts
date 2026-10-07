import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { sendBrevoSms } from '../_shared/brevo.ts';
import { buildWeeklySms } from '../_shared/alertMessages.ts';
import { capturePostHogException } from '../_shared/posthog.ts';

// Weekly price-drop SMS digest — Friday 3 PM America/Los_Angeles.
//
// pg_cron (UTC) calls this at 22:00 and 23:00 UTC every Friday: 3 PM Pacific is
// 22:00 UTC during daylight time and 23:00 UTC during standard time. Each call
// checks the actual LA wall clock and exits unless it's the 3 PM hour, so
// exactly one of the two calls sends. Pass { force: true } to send now (testing).
//
// Recipients: sms_alerts_enabled AND a verified phone (phone_verified_at). Each
// text covers that user's alerts not yet texted, not dismissed, and created in
// the last 30 days (the price-adjustment window). texted_at stamps prevent
// repeats.

function laHourAndWeekday(now: Date): { hour: number; weekday: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(now);
  return {
    hour: Number(parts.find((p) => p.type === 'hour')?.value),
    weekday: parts.find((p) => p.type === 'weekday')?.value ?? '',
  };
}

// Only pg_cron (which sends the service-role key) may run this: with the
// gateway's default verify_jwt, any signed-in user's token would otherwise be
// accepted, and { force: true } would let them trigger paid texts to everyone.
// The gateway has already verified the signature; this checks the role claim.
function isServiceRole(req: Request): boolean {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const payload = token.split('.')[1];
  if (!payload) return false;
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return claims.role === 'service_role';
  } catch {
    return false;
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!isServiceRole(req)) return json({ error: 'Forbidden' }, 403);

  try {
    const body = await req.json().catch(() => ({}));
    const force = (body as { force?: boolean }).force === true;

    const { hour, weekday } = laHourAndWeekday(new Date());
    if (!force && !(weekday === 'Fri' && hour === 15)) {
      return json({ skipped: true, reason: `LA time is ${weekday} ${hour}:00, not Fri 15:00` });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: recipients, error: recipientsError } = await supabase
      .from('profiles')
      .select('id, phone_number')
      .eq('sms_alerts_enabled', true)
      .not('phone_verified_at', 'is', null)
      .not('phone_number', 'is', null);
    if (recipientsError) throw recipientsError;

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    let textsSent = 0;
    let usersWithDrops = 0;

    for (const profile of recipients ?? []) {
      const { data: alerts, error: alertsError } = await supabase
        .from('price_alerts')
        .select('id, delta')
        .eq('user_id', profile.id)
        .is('texted_at', null)
        .is('dismissed_at', null)
        .gte('created_at', since);
      if (alertsError) {
        console.error(
          `weekly-price-texts: alerts query failed for ${profile.id}:`,
          alertsError.message,
        );
        continue;
      }
      if (!alerts || alerts.length === 0) continue;
      usersWithDrops++;

      const total = alerts.reduce((sum, a) => sum + Number(a.delta), 0);
      const sent = await sendBrevoSms(
        profile.phone_number!,
        buildWeeklySms(alerts.length, total),
        'weekly-price-drops',
      );
      if (!sent) continue;

      textsSent++;
      await supabase
        .from('price_alerts')
        .update({ texted_at: new Date().toISOString() })
        .in(
          'id',
          alerts.map((a) => a.id),
        );
    }

    console.log(
      `weekly-price-texts: ${recipients?.length ?? 0} opted in, ${usersWithDrops} with drops, ${textsSent} sent`,
    );
    return json({
      opted_in: recipients?.length ?? 0,
      users_with_drops: usersWithDrops,
      texts_sent: textsSent,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('weekly-price-texts error:', message);
    await capturePostHogException(err, { functionName: 'weekly-price-texts' });
    return json({ error: message }, 500);
  }
}
