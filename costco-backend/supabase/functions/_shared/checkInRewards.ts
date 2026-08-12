import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type SupabaseClient = ReturnType<typeof createClient>;

const FAN_TIERS = [
  { min: 21, name: 'ExecutiveExplorer' },
  { min: 11, name: 'GoldStarGuru' },
  { min: 6,  name: 'BulkBuyer' },
  { min: 3,  name: 'WholesaleWanderer' },
  { min: 1,  name: 'KirklandCadet' },
] as const;

export function tierForStars(stars: number): string {
  return FAN_TIERS.find((t) => stars >= t.min)?.name ?? 'KirklandCadet';
}

export interface NewBadge {
  trigger_key: string;
  name: string;
  icon: string | null;
}

export async function evaluateBadges(
  supabase: SupabaseClient,
  userId: string,
  warehouseTier: string,
  totalStars: number,
): Promise<NewBadge[]> {
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

  const newlyEarned = badgeDefs.filter(
    (b) => b.trigger_key && satisfied.has(b.trigger_key) && !alreadyEarned.has(b.trigger_key),
  );

  if (newlyEarned.length === 0) return [];

  await supabase.from('user_badges').insert(
    newlyEarned.map((b) => ({ user_id: userId, badge_id: b.id, warehouse_id: null })),
  );

  return newlyEarned.map((b) => ({ trigger_key: b.trigger_key, name: b.name, icon: b.icon }));
}

export interface CheckInInput {
  user_id: string;
  warehouse_id: string;
  latitude?: number | null;
  longitude?: number | null;
  distance_meters?: number | null;
  /** ISO timestamp. Omit to use the DB default (now). */
  checked_in_at?: string;
}

export interface CheckInAward {
  /** True when a check-in for this user+warehouse+day already existed; nothing was changed. */
  already_checked_in: boolean;
  total_stars: number;
  fan_tier: string;
  tier_upgraded: boolean;
  new_badges: NewBadge[];
}

/**
 * Inserts a check-in and applies its rewards (stars, fan tier, badges).
 *
 * A same-user/same-warehouse/same-day duplicate is a no-op, not an error — the
 * `check_ins_user_warehouse_day` unique index is the cooldown, and callers rely
 * on hitting it rather than pre-checking. Any other insert failure throws.
 */
export async function awardCheckIn(
  supabase: SupabaseClient,
  input: CheckInInput,
  warehouseTier: string,
): Promise<CheckInAward> {
  const { error: insertErr } = await supabase
    .from('check_ins')
    .insert({ ...input, stars_earned: 1 });

  const alreadyCheckedIn =
    insertErr?.code === '23505' ||
    (insertErr?.message?.includes('check_ins_user_warehouse_day') ?? false);

  if (insertErr && !alreadyCheckedIn) {
    throw new Error(insertErr.message);
  }

  const { data: profileData } = await supabase
    .from('profiles')
    .select('total_stars, fan_tier')
    .eq('id', input.user_id)
    .single();

  const prevStars: number = (profileData?.total_stars as number) ?? 0;
  const prevTier: string = (profileData?.fan_tier as string) ?? 'KirklandCadet';

  if (alreadyCheckedIn) {
    return {
      already_checked_in: true,
      total_stars: prevStars,
      fan_tier: prevTier,
      tier_upgraded: false,
      new_badges: [],
    };
  }

  const total_stars = prevStars + 1;
  const fan_tier = tierForStars(total_stars);

  await supabase
    .from('profiles')
    .update({ total_stars, fan_tier })
    .eq('id', input.user_id);

  const new_badges = await evaluateBadges(supabase, input.user_id, warehouseTier, total_stars);

  return {
    already_checked_in: false,
    total_stars,
    fan_tier,
    tier_upgraded: fan_tier !== prevTier,
    new_badges,
  };
}
