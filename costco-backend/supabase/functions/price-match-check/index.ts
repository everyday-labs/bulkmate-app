import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // TODO: implement price match check
  // 1. Scan receipt_items where transaction_date > NOW() - 30 days
  // 2. For each item, check current_price vs unit_price (24h cache)
  // 3. If cache stale, call Unwrangle/Apify API
  // 4. Also query OCR ledger for same SKU at nearby warehouses
  // 5. Take lower of (API price, OCR ledger price)
  // 6. If current_price < unit_price, fire Expo push notification

  return new Response(JSON.stringify({ message: 'not implemented' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 501,
  });
});
