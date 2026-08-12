import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { capturePostHogException } from '../_shared/posthog.ts';

// Permanently deletes the calling user's account.
//
// Required by App Review Guideline 5.1.1(v): an app that lets you create an
// account must let you delete it from inside the app.
//
// Every user-owned table cascades from auth.users:
//   auth.users → profiles → receipts → receipt_items → price_alerts
//   auth.users → check_ins
//   profiles   → user_badges, price_alerts
// so `auth.admin.deleteUser` clears the database on its own. Storage objects
// are NOT foreign-keyed to the user, so the receipt images have to be removed
// explicitly — and they must be read out *before* the user row disappears.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    });

  let userId: string | undefined;
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const authHeader = req.headers.get('Authorization') ?? '';
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );

    // The account deleted is always the caller's own, taken from the verified
    // JWT. There is deliberately no user_id parameter — accepting one would
    // let any signed-in user delete anybody's account.
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);
    userId = user.id;

    const { data: receipts } = await supabase
      .from('receipts')
      .select('image_path')
      .eq('user_id', userId);

    const imagePaths = (receipts ?? [])
      .map((r) => r.image_path as string | null)
      .filter((p): p is string => !!p);

    if (imagePaths.length > 0) {
      const { error: storageErr } = await supabase.storage
        .from('receipts')
        .remove(imagePaths);
      // Orphaned images are a cleanup problem, not a reason to strand the user
      // with an account they asked to delete.
      if (storageErr) {
        console.warn('delete-account: storage cleanup failed:', storageErr.message);
      }
    }

    const { error: deleteErr } = await supabase.auth.admin.deleteUser(userId);
    if (deleteErr) {
      console.error('delete-account: user delete failed:', deleteErr.message);
      return json({ error: deleteErr.message }, 500);
    }

    console.log(`delete-account: removed user ${userId} and ${imagePaths.length} receipt image(s)`);
    return json({ deleted: true, imagesRemoved: imagePaths.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('delete-account error:', message);
    await capturePostHogException(e, { functionName: 'delete-account' }, userId);
    return json({ error: message }, 500);
  }
});
