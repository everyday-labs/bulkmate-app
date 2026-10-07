// Who is calling an Edge Function. The gateway's default verify_jwt only
// proves the token was signed by this project — the public anon key passes
// it too. Any function that spends money (Vision, RapidAPI, Brevo) or acts
// for a user must check the caller itself with one of these.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

function bearerToken(req: Request): string {
  return (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
}

/**
 * True only for the service-role key (pg_cron jobs, function-to-function
 * calls). The gateway has already verified the signature; this checks the
 * role claim.
 */
export function isServiceRole(req: Request): boolean {
  const payload = bearerToken(req).split('.')[1];
  if (!payload) return false;
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return claims.role === 'service_role';
  } catch {
    return false;
  }
}

/** The signed-in user's id, or null for the anon key / a bad token. */
export async function getCallerUserId(
  supabase: SupabaseClient,
  req: Request,
): Promise<string | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user?.id ?? null;
}
