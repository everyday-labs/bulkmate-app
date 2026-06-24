import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // TODO: implement barcode/SKU lookup
  // 1. Accept SKU from client
  // 2. Check products cache (is price_updated_at < 24h old?)
  // 3. If stale or missing, call Unwrangle/Apify for Costco product data
  // 4. Cache result in products table
  // 5. Return product info (name, price, description) — target < 350ms

  return new Response(JSON.stringify({ message: 'not implemented' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 501,
  });
});
