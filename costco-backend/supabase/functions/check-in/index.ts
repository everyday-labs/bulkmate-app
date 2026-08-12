import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { capturePostHogException } from '../_shared/posthog.ts';
import { awardCheckIn } from '../_shared/checkInRewards.ts';

// ---------------------------------------------------------------------------
// Haversine distance in metres
// ---------------------------------------------------------------------------

function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}

async function receiptCheckIn(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  receiptId: string,
  warehouseId: string | undefined,
): Promise<Response> {
  if (!warehouseId) return json({ error: 'warehouse_id is required' }, 400);

  const { data: receipt } = await supabase
    .from('receipts')
    .select('id, user_id, warehouse_id, transaction_date')
    .eq('id', receiptId)
    .maybeSingle();

  if (!receipt || receipt.user_id !== userId) return json({ error: 'Receipt not found' }, 404);
  if (receipt.warehouse_id) return json({ error: 'Receipt already linked to a warehouse' }, 409);

  const { data: warehouse } = await supabase
    .from('warehouses')
    .select('id, name, city, tier')
    .eq('id', warehouseId)
    .maybeSingle();

  if (!warehouse) return json({ error: 'Warehouse not found' }, 404);

  const { error: linkErr } = await supabase
    .from('receipts')
    .update({ warehouse_id: warehouseId })
    .eq('id', receiptId);

  if (linkErr) return json({ error: linkErr.message }, 500);

  try {
    const award = await awardCheckIn(
      supabase,
      {
        user_id: userId,
        warehouse_id: warehouseId,
        checked_in_at: `${receipt.transaction_date}T12:00:00Z`,
      },
      warehouse.tier as string,
    );
    return json({
      warehouse: { id: warehouse.id, name: warehouse.name, city: warehouse.city, tier: warehouse.tier },
      ...award,
    });
  } catch (e) {
    // The link succeeded, which is what the user actually asked for. A failed
    // reward is not worth failing the request over.
    console.warn('receipt check-in award failed:', e instanceof Error ? e.message : String(e));
    return json({
      warehouse: { id: warehouse.id, name: warehouse.name, city: warehouse.city, tier: warehouse.tier },
      already_checked_in: true,
      total_stars: 0,
      fan_tier: 'KirklandCadet',
      tier_upgraded: false,
      new_badges: [],
    });
  }
}

// ---------------------------------------------------------------------------
// Main handler
//
// POST { latitude: number, longitude: number }
// Returns: { warehouse, stars_earned, total_stars, fan_tier, tier_upgraded,
//            already_checked_in, new_badges }
// ---------------------------------------------------------------------------

const CHECK_IN_RADIUS_M = 50;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let userId: string | undefined;
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    userId = user?.id;
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 },
      );
    }

    const payload = await req.json() as {
      latitude?: number;
      longitude?: number;
      receipt_id?: string;
      warehouse_id?: string;
    };

    // Receipt-attested check-in: the parser couldn't resolve a warehouse from
    // the receipt header, so the user picked one by hand on the receipt-success
    // screen. A receipt is its own proof of presence, so there's no GPS gate —
    // but the receipt must belong to the caller and must not already be linked,
    // otherwise this becomes a way to mint check-ins from one upload.
    if (payload.receipt_id) {
      return await receiptCheckIn(supabase, user.id, payload.receipt_id, payload.warehouse_id);
    }

    const { latitude, longitude } = payload as { latitude: number; longitude: number };
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return new Response(
        JSON.stringify({ error: 'latitude and longitude are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    // 1. Load all warehouses
    const { data: warehouses } = await supabase
      .from('warehouses')
      .select('id, warehouse_code, name, city, latitude, longitude, tier');

    if (!warehouses?.length) {
      return new Response(
        JSON.stringify({ error: 'No warehouses found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
      );
    }

    // 2. Find nearest warehouse
    let nearest: typeof warehouses[number] | null = null;
    let nearestDist = Infinity;
    for (const wh of warehouses) {
      if (wh.latitude == null || wh.longitude == null) continue;
      const d = haversineMetres(latitude, longitude, Number(wh.latitude), Number(wh.longitude));
      if (d < nearestDist) { nearestDist = d; nearest = wh; }
    }

    if (!nearest) {
      return new Response(
        JSON.stringify({ error: 'No warehouse coordinates found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
      );
    }

    // 3. Distance gate
    if (nearestDist > CHECK_IN_RADIUS_M) {
      return new Response(
        JSON.stringify({
          error: 'too_far',
          distance_metres: Math.round(nearestDist),
          nearest_warehouse: { id: nearest.id, name: nearest.name, city: nearest.city },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    // 4. Insert check-in + apply rewards (unique index = one per day cooldown)
    let award;
    try {
      award = await awardCheckIn(
        supabase,
        {
          user_id: user.id,
          warehouse_id: nearest.id,
          latitude,
          longitude,
          distance_meters: Math.round(nearestDist),
        },
        nearest.tier,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('check-in insert error:', message);
      return new Response(
        JSON.stringify({ error: message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
      );
    }

    const { already_checked_in: alreadyCheckedIn, total_stars, fan_tier, tier_upgraded, new_badges } = award;

    return new Response(
      JSON.stringify({
        warehouse: {
          id: nearest.id,
          name: nearest.name,
          city: nearest.city,
          tier: nearest.tier,
          distance_metres: Math.round(nearestDist),
        },
        stars_earned: alreadyCheckedIn ? 0 : 1,
        total_stars,
        fan_tier,
        tier_upgraded,
        already_checked_in: alreadyCheckedIn,
        new_badges,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('check-in error:', message);
    await capturePostHogException(err, { functionName: 'check-in' }, userId);
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});
