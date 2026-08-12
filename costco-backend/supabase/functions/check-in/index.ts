import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { capturePostHogException } from '../_shared/posthog.ts';

// ---------------------------------------------------------------------------
// Fan-tier thresholds
// ---------------------------------------------------------------------------

const FAN_TIERS = [
  { min: 21, name: 'ExecutiveExplorer' },
  { min: 11, name: 'GoldStarGuru' },
  { min: 6,  name: 'BulkBuyer' },
  { min: 3,  name: 'WholesaleWanderer' },
  { min: 1,  name: 'KirklandCadet' },
] as const;

function tierForStars(stars: number): string {
  return FAN_TIERS.find((t) => stars >= t.min)?.name ?? 'KirklandCadet';
}

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

// ---------------------------------------------------------------------------
// Badge evaluation — returns trigger_keys of newly earned badges
// ---------------------------------------------------------------------------

async function evaluateBadges(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  warehouseTier: string,
  totalStars: number,
): Promise<{ trigger_key: string; name: string; icon: string | null }[]> {
  // Fetch check-in stats in parallel
  const [totalCheckInsRes, distinctWarehousesRes, existingBadgesRes, badgeDefsRes] =
    await Promise.all([
      supabase
        .from('check_ins')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabase
        .from('check_ins')
        .select('warehouse_id')
        .eq('user_id', userId),
      supabase
        .from('user_badges')
        .select('badges(trigger_key)')
        .eq('user_id', userId),
      supabase
        .from('badges')
        .select('id, trigger_key, name, icon'),
    ]);

  const totalCheckIns = totalCheckInsRes.count ?? 0;
  const distinctWarehouses = new Set(
    (distinctWarehousesRes.data ?? []).map((r: any) => r.warehouse_id),
  ).size;

  const alreadyEarned = new Set(
    (existingBadgesRes.data ?? []).map((r: any) => r.badges?.trigger_key).filter(Boolean),
  );

  const badgeDefs: { id: string; trigger_key: string; name: string; icon: string | null }[] =
    badgeDefsRes.data ?? [];

  // Evaluate which trigger keys are now satisfied
  const tierName = tierForStars(totalStars);
  const satisfied = new Set<string>();

  if (totalCheckIns >= 1)  satisfied.add('first_checkin');
  if (totalCheckIns >= 5)  satisfied.add('five_checkins');
  if (totalCheckIns >= 10) satisfied.add('ten_checkins');
  if (distinctWarehouses >= 3) satisfied.add('three_warehouses');
  if (distinctWarehouses >= 5) satisfied.add('five_warehouses');
  if (warehouseTier === 'Rare')      satisfied.add('rare_warehouse');
  if (warehouseTier === 'Legendary') satisfied.add('legendary_warehouse');
  if (totalStars >= 10) satisfied.add('ten_stars');
  if (tierName === 'GoldStarGuru' || tierName === 'ExecutiveExplorer') satisfied.add('gold_star_guru');
  if (tierName === 'ExecutiveExplorer') satisfied.add('executive_explorer');

  // Only badges that are satisfied AND not already earned
  const newlyEarned = badgeDefs.filter(
    (b) => b.trigger_key && satisfied.has(b.trigger_key) && !alreadyEarned.has(b.trigger_key),
  );

  if (newlyEarned.length === 0) return [];

  // Insert new user_badges (ignore conflicts)
  await supabase.from('user_badges').insert(
    newlyEarned.map((b) => ({ user_id: userId, badge_id: b.id, warehouse_id: null })),
  );

  return newlyEarned.map((b) => ({ trigger_key: b.trigger_key, name: b.name, icon: b.icon }));
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

    const { latitude, longitude } = await req.json() as { latitude: number; longitude: number };
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

    // 4. Insert check-in (unique index = one per day cooldown)
    const { error: insertErr } = await supabase.from('check_ins').insert({
      user_id: user.id,
      warehouse_id: nearest.id,
      latitude,
      longitude,
      distance_meters: Math.round(nearestDist),
      stars_earned: 1,
    });

    const alreadyCheckedIn =
      insertErr?.code === '23505' ||
      insertErr?.message?.includes('check_ins_user_warehouse_day');

    if (insertErr && !alreadyCheckedIn) {
      console.error('check-in insert error:', insertErr.message);
      return new Response(
        JSON.stringify({ error: insertErr.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
      );
    }

    // 5. Fetch current profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('total_stars, fan_tier')
      .eq('id', user.id)
      .single();

    const prevStars: number = profileData?.total_stars ?? 0;
    const prevTier: string = profileData?.fan_tier ?? 'KirklandCadet';

    let total_stars = prevStars;
    let fan_tier = prevTier;
    let tier_upgraded = false;
    let new_badges: { trigger_key: string; name: string; icon: string | null }[] = [];

    if (!alreadyCheckedIn) {
      // 6. Increment stars + advance tier
      total_stars = prevStars + 1;
      fan_tier = tierForStars(total_stars);
      tier_upgraded = fan_tier !== prevTier;

      await supabase
        .from('profiles')
        .update({ total_stars, fan_tier })
        .eq('id', user.id);

      // 7. Evaluate and award badges
      new_badges = await evaluateBadges(supabase, user.id, nearest.tier, total_stars);
    }

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
