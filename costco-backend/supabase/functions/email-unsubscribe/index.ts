import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyUnsubscribeToken } from '../_shared/notifyLinks.ts';
import { capturePostHogException } from '../_shared/posthog.ts';

// One-click unsubscribe from price-drop emails. Opened from a mail client, so
// there's no session: deployed with verify_jwt = false (see config.toml), and
// authorized instead by the HMAC token in the link (_shared/notifyLinks.ts).
//
//   GET  ?u=<user id>&t=<token>  — link in the email footer; returns a page
//   POST ?u=<user id>&t=<token>  — RFC 8058 one-click (Gmail/Yahoo "Unsubscribe"
//                                  button, via the List-Unsubscribe-Post header)
//
// Only email alerts are switched off; push and texts have their own controls.

function page(title: string, message: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#FDFAF3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:440px;margin:48px auto;padding:32px 28px;background:#FFFFFF;border-radius:16px;text-align:center;">
<div style="display:inline-block;width:48px;height:48px;line-height:48px;border-radius:12px;background:#D1373A;color:#FFFFFF;font-size:24px;font-weight:900;">B</div>
<h1 style="font-size:22px;color:#1B2A4A;">${title}</h1>
<p style="font-size:15px;line-height:1.5;color:#4A4A4A;">${message}</p>
<p style="font-size:12px;color:#A0A0A0;"><a href="https://everyday-labs.org" style="color:#A0A0A0;">Bulkmate by Everyday Labs</a></p>
</div></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST')
    return new Response('Method not allowed', { status: 405 });

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('u') ?? '';
    const token = url.searchParams.get('t') ?? '';

    if (!userId || !token || !(await verifyUnsubscribeToken(userId, token))) {
      return page(
        'Link not valid',
        'This unsubscribe link is invalid or incomplete. You can turn off price-drop emails in the app under Profile → Preferences.',
        400,
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { error } = await supabase
      .from('profiles')
      .update({ email_alerts_enabled: false })
      .eq('id', userId);
    if (error) throw error;

    if (req.method === 'POST') return new Response(null, { status: 204 });
    return page(
      'You’re unsubscribed',
      'You won’t get price-drop emails anymore. Push notifications and texts are unaffected, and you can turn emails back on anytime in the app under Profile → Preferences.',
    );
  } catch (err: unknown) {
    console.error('email-unsubscribe error:', err instanceof Error ? err.message : err);
    await capturePostHogException(err, { functionName: 'email-unsubscribe' });
    return page(
      'Something went wrong',
      'Please try again, or turn off price-drop emails in the app under Profile → Preferences.',
      500,
    );
  }
});
