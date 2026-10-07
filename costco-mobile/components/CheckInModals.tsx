import { useEffect, useMemo, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ColorScheme } from '../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../constants/theme';
import { ConfettiBurst, DrawnCheck, RingOut, StarToss } from './ScanEffects';
import { Sparkle, Shimmer, StampBounceIn, Twinkle } from './Motion';

export type CheckInResult = {
  warehouse: { name: string; city: string; tier: string; distance_metres: number };
  stars_earned: number;
  total_stars: number;
  fan_tier: string;
  tier_upgraded: boolean;
  already_checked_in: boolean;
  new_badges: { trigger_key: string; name: string; icon: string | null }[];
};

export type TooFarInfo = { miles: string; warehouse: string };

const TIER_LABEL: Record<string, string> = {
  KirklandCadet: 'Kirkland Cadet',
  WholesaleWanderer: 'Wholesale Wanderer',
  BulkBuyer: 'Bulk Buyer',
  GoldStarGuru: 'Gold Star Guru',
  ExecutiveExplorer: 'Executive Explorer',
};

const TIER_EMOJI: Record<string, string> = {
  KirklandCadet: '🛒',
  WholesaleWanderer: '🗺',
  BulkBuyer: '📦',
  GoldStarGuru: '🌟',
  ExecutiveExplorer: '👑',
};

export function TooFarModal({
  miles,
  warehouse,
  onClose,
  Colors,
}: {
  miles: string;
  warehouse: string;
  onClose: () => void;
  Colors: ColorScheme;
}) {
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Animated.View
          style={[styles.modalSheet, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}
        >
          <Text style={styles.modalStar}>🗺</Text>

          <Text style={styles.modalTitle}>Still in Aisle Zero</Text>

          <View style={styles.tooFarDistanceRow}>
            <Text style={styles.tooFarMiles}>{miles} mi</Text>
            <Text style={styles.tooFarLabel}>FROM YOUR NEAREST COSTCO</Text>
          </View>

          <Text style={styles.tooFarWarehouse}>{warehouse}</Text>

          <Text style={styles.modalSubtext}>
            You're not quite in range yet. Head over to the warehouse and check in once you're
            inside — your star is waiting!
          </Text>

          <Pressable
            style={({ pressed }) => [styles.modalDoneBtn, pressed && styles.modalDoneBtnPressed]}
            onPress={onClose}
          >
            <Text style={styles.modalDoneBtnText}>Got it</Text>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

export function CheckInModal({
  result,
  onClose,
  Colors,
}: {
  result: CheckInResult;
  onClose: () => void;
  Colors: ColorScheme;
}) {
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAlreadyIn = result.already_checked_in;
  const tierColor = result.tier_upgraded ? Colors.goldStarAccent : Colors.executiveNavy;

  return (
    <Modal transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Animated.View
          style={[styles.modalSheet, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}
        >
          {isAlreadyIn ? (
            <Text style={styles.modalStar}>✅</Text>
          ) : (
            <View style={styles.checkInIconWrap}>
              <RingOut color={Colors.success} />
              <RingOut color={Colors.success} delay={220} />
              <ConfettiBurst count={12} distance={54} />
              <StampBounceIn style={styles.checkInStamp}>
                <DrawnCheck size={34} color={Colors.white} delay={420} />
              </StampBounceIn>
              {result.warehouse.tier === 'Legendary' && (
                <>
                  <Sparkle
                    size={12}
                    color={Colors.goldStarAccent}
                    delay={500}
                    style={styles.sparkleTL}
                  />
                  <Sparkle
                    size={9}
                    color={Colors.goldStarAccent}
                    delay={780}
                    style={styles.sparkleBR}
                  />
                </>
              )}
            </View>
          )}

          <Text style={styles.modalTitle}>
            {isAlreadyIn ? 'Already Checked In' : 'Checked In!'}
          </Text>

          <Text style={styles.modalWarehouse}>{result.warehouse.name}</Text>
          <Text style={styles.modalCity}>
            {result.warehouse.city} · {result.warehouse.tier}
            {!isAlreadyIn
              ? ` · verified ${Math.round(result.warehouse.distance_metres)}m from center`
              : ''}
          </Text>

          {isAlreadyIn ? (
            <Text style={styles.modalSubtext}>
              You already earned your star here today. Come back tomorrow!
            </Text>
          ) : (
            <>
              {result.stars_earned > 1 && (
                <View style={styles.starsAwardedRow}>
                  {Array.from({ length: result.stars_earned }).map((_, i) => (
                    <StarToss key={i} index={i} baseDelay={420}>
                      <Twinkle>
                        <Text style={styles.starsAwardedIcon}>⭐</Text>
                      </Twinkle>
                    </StarToss>
                  ))}
                </View>
              )}
              <View style={styles.modalStatsRow}>
                <View style={styles.modalStat}>
                  <StarToss index={0}>
                    <Text style={styles.modalStatValue}>+{result.stars_earned}</Text>
                  </StarToss>
                  <Text style={styles.modalStatLabel}>
                    {result.stars_earned > 1 ? 'STARS EARNED' : 'STAR EARNED'}
                  </Text>
                </View>
                <View style={styles.modalStatDivider} />
                <View style={styles.modalStat}>
                  <StarToss index={1}>
                    <Text style={styles.modalStatValue}>{result.total_stars}</Text>
                  </StarToss>
                  <Text style={styles.modalStatLabel}>TOTAL STARS</Text>
                </View>
              </View>
            </>
          )}

          {/* Tier upgrade banner */}
          {result.tier_upgraded && (
            <View style={[styles.tierUpgradeBanner, { borderColor: tierColor }]}>
              <Shimmer width={70} style={{ borderRadius: radius.xl }} />
              <Text style={styles.tierUpgradeEmoji}>{TIER_EMOJI[result.fan_tier] ?? '🎉'}</Text>
              <View>
                <Text style={styles.tierUpgradeTitle}>Tier Upgrade!</Text>
                <Text style={[styles.tierUpgradeName, { color: tierColor }]}>
                  {TIER_LABEL[result.fan_tier] ?? result.fan_tier}
                </Text>
              </View>
            </View>
          )}

          {/* New badges */}
          {result.new_badges?.length > 0 && (
            <View style={styles.newBadgesSection}>
              <Text style={styles.newBadgesLabel}>NEW BADGES EARNED</Text>
              <View style={styles.newBadgesList}>
                {result.new_badges.map((b) => (
                  <View key={b.trigger_key} style={styles.newBadgeChip}>
                    <Text style={styles.newBadgeIcon}>{b.icon ?? '🏅'}</Text>
                    <Text style={styles.newBadgeName}>{b.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.modalDoneBtn, pressed && styles.modalDoneBtnPressed]}
            onPress={onClose}
          >
            <Text style={styles.modalDoneBtnText}>Done</Text>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (Colors: ColorScheme) =>
  StyleSheet.create({
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing['2xl'],
    },
    modalSheet: {
      width: '100%',
      backgroundColor: Colors.surface,
      borderRadius: radius['3xl'],
      padding: spacing['3xl'],
      alignItems: 'center',
      gap: spacing.lg,
      ...shadow.md,
    },
    modalStar: { fontSize: 64, marginBottom: spacing.xs },
    checkInIconWrap: {
      width: 72,
      height: 72,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
    },
    checkInStamp: {
      width: 64,
      height: 64,
      borderRadius: radius.pill,
      backgroundColor: Colors.successSolid,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sparkleTL: { position: 'absolute', top: 2, left: 6 },
    sparkleBR: { position: 'absolute', bottom: 4, right: 2 },
    starsAwardedRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: -spacing.xs,
    },
    starsAwardedIcon: { fontSize: 22 },
    modalTitle: {
      fontSize: fontSize['3xl'],
      fontWeight: '800',
      color: Colors.gray[900],
      letterSpacing: letterSpacing.tight,
    },
    modalWarehouse: {
      fontSize: fontSize.lg,
      fontWeight: '700',
      color: Colors.gray[800],
      textAlign: 'center',
    },
    modalCity: { fontSize: fontSize.sm, color: Colors.gray[400], textAlign: 'center' },
    modalSubtext: {
      fontSize: fontSize.sm,
      color: Colors.gray[400],
      textAlign: 'center',
      lineHeight: 20,
    },
    modalStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.background,
      borderRadius: radius.xl,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing['2xl'],
      gap: spacing.xl,
      marginVertical: spacing.xs,
    },
    modalStat: { alignItems: 'center', flex: 1 },
    modalStatValue: {
      fontSize: fontSize['3xl'],
      fontWeight: '800',
      color: Colors.gray[900],
      letterSpacing: letterSpacing.tight,
    },
    modalStatLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: Colors.gray[400],
      letterSpacing: letterSpacing.caps,
      marginTop: 2,
    },
    modalStatDivider: { width: 1, height: 40, backgroundColor: Colors.border },

    // Too far modal
    tooFarDistanceRow: {
      backgroundColor: Colors.costcoRedSubtle,
      borderRadius: radius.xl,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing['3xl'],
      alignItems: 'center',
      width: '100%',
    },
    tooFarMiles: {
      fontSize: fontSize['4xl'],
      fontWeight: '800',
      color: Colors.costcoRed,
      letterSpacing: letterSpacing.tight,
    },
    tooFarLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: Colors.costcoRed,
      letterSpacing: letterSpacing.caps,
      marginTop: 2,
      opacity: 0.7,
    },
    tooFarWarehouse: {
      fontSize: fontSize.lg,
      fontWeight: '700',
      color: Colors.gray[800],
      textAlign: 'center',
    },
    tierUpgradeBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      borderWidth: 1.5,
      borderRadius: radius.xl,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      width: '100%',
      overflow: 'hidden',
      position: 'relative',
    },
    tierUpgradeEmoji: { fontSize: 28 },
    tierUpgradeTitle: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: Colors.gray[400],
      letterSpacing: letterSpacing.caps,
    },
    tierUpgradeName: {
      fontSize: fontSize.lg,
      fontWeight: '800',
      letterSpacing: letterSpacing.tight,
    },
    newBadgesSection: { width: '100%', gap: spacing.sm },
    newBadgesLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: Colors.gray[400],
      letterSpacing: letterSpacing.caps,
    },
    newBadgesList: { gap: spacing.xs },
    newBadgeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: Colors.goldStarLight + '30',
      borderRadius: radius.lg,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    newBadgeIcon: { fontSize: 18 },
    newBadgeName: { fontSize: fontSize.sm, fontWeight: '700', color: Colors.gray[800] },
    modalDoneBtn: {
      backgroundColor: Colors.costcoRedSolid,
      borderRadius: radius.lg,
      paddingVertical: spacing.lg,
      width: '100%',
      alignItems: 'center',
      marginTop: spacing.xs,
      ...shadow.sm,
    },
    modalDoneBtnPressed: { backgroundColor: Colors.costcoRedDark },
    modalDoneBtnText: {
      color: Colors.white,
      fontSize: fontSize.md,
      fontWeight: '700',
      letterSpacing: letterSpacing.wide,
    },
  });
