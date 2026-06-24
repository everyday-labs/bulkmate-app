import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // TODO: implement geo-fenced check-in
  // 1. Accept GPS coordinates + warehouse_id from client
  // 2. Haversine distance check against warehouse coordinates (150m threshold)
  // 3. Insert UserBadge, recalculate total_stars, advance fan_tier if threshold crossed
  // 4. Return updated fan_tier + badge info

  return new Response(JSON.stringify({ message: 'not implemented' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 501,
  });
});
