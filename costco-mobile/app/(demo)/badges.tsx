import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WarehouseColorsLight as Colors } from '../../constants/colors.warehouse';
import { fontFamily, fontSize, radius, spacing } from '../../constants/theme.warehouse';
import { BadgeTile, Button, Card, SectionLabel } from '../../components/warehouse/ui';
import { FadeUpView, TierUpBurst } from '../../components/warehouse/WarehouseMotion';
import { DemoHeader } from '../../components/warehouse/DemoHeader';

const BADGES = [
  { key: 'first_checkin', icon: '👟', name: 'First Steps', unlocked: true },
  { key: 'five_checkins', icon: '🏪', name: 'Regular', unlocked: true },
  { key: 'ten_checkins', icon: '💪', name: 'Devoted Member', unlocked: false },
  { key: 'three_warehouses', icon: '🗺', name: 'Explorer', unlocked: true },
  { key: 'five_warehouses', icon: '✈️', name: 'Warehouse Hopper', unlocked: false },
  { key: 'rare_warehouse', icon: '💎', name: 'Rare Discovery', unlocked: false },
  { key: 'legendary_warehouse', icon: '🏆', name: 'Legendary Visit', unlocked: false },
  { key: 'ten_stars', icon: '⭐', name: 'Star Collector', unlocked: false },
  { key: 'gold_star_guru', icon: '🌟', name: 'Gold Standard', unlocked: false },
  { key: 'executive_explorer', icon: '👑', name: 'Executive', unlocked: false },
];

const TIERS = [
  { name: 'Kirkland Cadet', threshold: 1 },
  { name: 'Wholesale Wanderer', threshold: 3 },
  { name: 'Bulk Buyer', threshold: 6 },
  { name: 'Gold Star Guru', threshold: 11 },
  { name: 'Executive Explorer', threshold: 21 },
];

const CURRENT_STARS = 7;

export default function DemoBadgesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [showBurst, setShowBurst] = useState(false);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing['2xl'] }]}
      showsVerticalScrollIndicator={false}
    >
      <DemoHeader title="Badges & Tiers" onBack={() => router.back()} />

      {/* Tier ladder */}
      <FadeUpView index={0} style={styles.section}>
        <SectionLabel>Fan Tier Ladder</SectionLabel>
        <Card style={styles.ladderCard}>
          {TIERS.map((tier, i) => {
            const reached = CURRENT_STARS >= tier.threshold;
            const isCurrent =
              reached && (i === TIERS.length - 1 || CURRENT_STARS < TIERS[i + 1].threshold);
            return (
              <View key={tier.name} style={styles.ladderRow}>
                <View style={[styles.ladderDot, reached && styles.ladderDotReached, isCurrent && styles.ladderDotCurrent]} />
                <View style={styles.ladderBody}>
                  <Text style={[styles.ladderTier, reached && styles.ladderTierReached]}>{tier.name}</Text>
                  <Text style={styles.ladderThreshold}>{tier.threshold}+ stars</Text>
                </View>
                {isCurrent && (
                  <View style={styles.currentChip}>
                    <Text style={styles.currentChipText}>YOU</Text>
                  </View>
                )}
              </View>
            );
          })}
        </Card>
      </FadeUpView>

      {/* Demo trigger */}
      <FadeUpView index={1} style={styles.section}>
        <Button title="Preview Tier-Up Celebration" variant="secondary" icon="🎉" onPress={() => setShowBurst(true)} />
      </FadeUpView>

      {/* Badge grid */}
      <FadeUpView index={2} style={styles.section}>
        <SectionLabel>Badges — {BADGES.filter((b) => b.unlocked).length}/{BADGES.length} Unlocked</SectionLabel>
        <View style={styles.grid}>
          {BADGES.map((b) => (
            <BadgeTile key={b.key} icon={b.icon} name={b.name} unlocked={b.unlocked} />
          ))}
        </View>
      </FadeUpView>

      {/* Tier-up celebration overlay */}
      <Modal transparent visible={showBurst} animationType="fade" onRequestClose={() => setShowBurst(false)}>
        <Pressable style={styles.overlayBackdrop} onPress={() => setShowBurst(false)}>
          <TierUpBurst visible={showBurst}>
            <View style={styles.tierUpCard}>
              <Text style={styles.tierUpEmoji}>🌟</Text>
              <Text style={styles.tierUpLabel}>TIER UP!</Text>
              <Text style={styles.tierUpName}>Gold Star Guru</Text>
              <Text style={styles.tierUpHint}>Tap anywhere to close</Text>
            </View>
          </TierUpBurst>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: spacing.lg },
  section: { marginBottom: spacing.lg },
  ladderCard: { gap: spacing.md },
  ladderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  ladderDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.muted,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  ladderDotReached: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  ladderDotCurrent: { backgroundColor: Colors.primary, borderColor: Colors.primary, width: 14, height: 14, borderRadius: 7 },
  ladderBody: { flex: 1 },
  ladderTier: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.sm, color: Colors.mutedForeground },
  ladderTierReached: { fontFamily: fontFamily.bodySemibold, color: Colors.navy },
  ladderThreshold: { fontFamily: fontFamily.mono, fontSize: 10, color: Colors.mutedForeground },
  currentChip: { backgroundColor: Colors.redLight, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  currentChipText: { fontFamily: fontFamily.bodyBold, fontSize: 10, color: Colors.primary, letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: '3.5%', rowGap: spacing.md },
  overlayBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(27,42,74,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierUpCard: {
    backgroundColor: Colors.card,
    borderRadius: radius['2xl'],
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing['3xl'],
    alignItems: 'center',
    gap: spacing.xs,
  },
  tierUpEmoji: { fontSize: 48, marginBottom: spacing.sm },
  tierUpLabel: { fontFamily: fontFamily.bodyBold, fontSize: fontSize.xs, color: Colors.mutedForeground, letterSpacing: 2 },
  tierUpName: { fontFamily: fontFamily.display, fontSize: fontSize['2xl'], color: Colors.primary },
  tierUpHint: { fontFamily: fontFamily.body, fontSize: fontSize.xs, color: Colors.mutedForeground, marginTop: spacing.md },
});
