import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WarehouseColorsLight as Colors } from '../../constants/colors.warehouse';
import { fontFamily, fontSize, radius, spacing } from '../../constants/theme.warehouse';
import { Button, Card, SectionLabel, StarCounter, TierPill } from '../../components/warehouse/ui';
import { FadeUpView, ScanPulse } from '../../components/warehouse/WarehouseMotion';
import { DemoHeader } from '../../components/warehouse/DemoHeader';

const SPEND_BY_MONTH = [
  { label: 'Mar', value: 210 },
  { label: 'Apr', value: 340 },
  { label: 'May', value: 180 },
  { label: 'Jun', value: 420 },
  { label: 'Jul', value: 260 },
  { label: 'Aug', value: 390 },
];
const MAX_SPEND = Math.max(...SPEND_BY_MONTH.map((m) => m.value));

const RECENT_ALERTS = [
  { id: '1', name: 'Kirkland Almonds 3lb', delta: 4.5 },
  { id: '2', name: 'Bounty Paper Towels 12ct', delta: 2.3 },
];

export default function DemoHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [starTrigger, setStarTrigger] = useState(0);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing['2xl'] }]}
      showsVerticalScrollIndicator={false}
    >
      <DemoHeader title="Home Dashboard" onBack={() => router.back()} />

      {/* Greeting */}
      <FadeUpView index={0}>
        <Text style={styles.greetingLine}>Good afternoon,</Text>
        <Text style={styles.greetingName}>Alex</Text>
      </FadeUpView>

      {/* Tier card — featured, full width */}
      <FadeUpView index={1} style={styles.section}>
        <Card variant="featured">
          <TierPill tierName="Bulk Buyer" stars={7} nextThreshold={11} />
        </Card>
      </FadeUpView>

      {/* Bento row: stars + alerts */}
      <FadeUpView index={2} style={[styles.section, styles.row]}>
        <Card style={styles.halfCard}>
          <SectionLabel>Stars</SectionLabel>
          <StarCounter count={7} trigger={starTrigger} />
          <View style={styles.ctaSmall}>
            <Button title="Earn one" variant="ghost" onPress={() => setStarTrigger((t) => t + 1)} />
          </View>
        </Card>
        <Card style={styles.halfCard}>
          <SectionLabel>Active Alerts</SectionLabel>
          <Text style={styles.bigStat}>{RECENT_ALERTS.length}</Text>
          <Text style={styles.bigStatSub}>~${RECENT_ALERTS.reduce((s, a) => s + a.delta, 0).toFixed(2)} owed</Text>
        </Card>
      </FadeUpView>

      {/* Spend chart */}
      <FadeUpView index={3} style={styles.section}>
        <Card>
          <SectionLabel>Spend, Last 6 Months</SectionLabel>
          <View style={styles.chart}>
            {SPEND_BY_MONTH.map((m) => (
              <View key={m.label} style={styles.chartCol}>
                <View style={styles.chartBarTrack}>
                  <View
                    style={[
                      styles.chartBarFill,
                      { height: `${(m.value / MAX_SPEND) * 100}%` },
                    ]}
                  />
                </View>
                <Text style={styles.chartLabel}>{m.label}</Text>
              </View>
            ))}
          </View>
        </Card>
      </FadeUpView>

      {/* Scan CTA */}
      <FadeUpView index={4} style={styles.section}>
        <ScanPulse active={false}>
          <Card>
            <View style={styles.scanRow}>
              <View style={styles.scanIconWrap}>
                <Text style={styles.scanIcon}>🧾</Text>
              </View>
              <View style={styles.scanBody}>
                <Text style={styles.scanTitle}>Scan a receipt</Text>
                <Text style={styles.scanSubtitle}>Track spend & unlock price alerts</Text>
              </View>
            </View>
            <View style={styles.scanCta}>
              <Button title="Open Scan Flow" onPress={() => router.push('/(demo)/scan')} />
            </View>
          </Card>
        </ScanPulse>
      </FadeUpView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: spacing.lg },
  greetingLine: { fontFamily: fontFamily.body, fontSize: fontSize.lg, color: Colors.mutedForeground },
  greetingName: { fontFamily: fontFamily.display, fontSize: fontSize['4xl'], color: Colors.navy, marginTop: 2, marginBottom: spacing.xl },
  section: { marginBottom: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.md },
  halfCard: { flex: 1, gap: spacing.xs },
  bigStat: { fontFamily: fontFamily.display, fontSize: fontSize['3xl'], color: Colors.primary },
  bigStatSub: { fontFamily: fontFamily.body, fontSize: fontSize.xs, color: Colors.mutedForeground },
  ctaSmall: { alignItems: 'flex-start', marginTop: -spacing.sm, marginLeft: -spacing.md },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: spacing.sm, marginTop: spacing.sm },
  chartCol: { flex: 1, alignItems: 'center', gap: spacing.xs, height: '100%', justifyContent: 'flex-end' },
  chartBarTrack: { width: '100%', height: 90, justifyContent: 'flex-end', borderRadius: radius.sm, overflow: 'hidden', backgroundColor: Colors.muted },
  chartBarFill: { width: '100%', backgroundColor: Colors.primary, borderRadius: radius.sm },
  chartLabel: { fontFamily: fontFamily.body, fontSize: 10, color: Colors.mutedForeground },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  scanIconWrap: { width: 48, height: 48, borderRadius: radius.lg, backgroundColor: Colors.redLight, alignItems: 'center', justifyContent: 'center' },
  scanIcon: { fontSize: 24 },
  scanBody: { flex: 1, gap: 2 },
  scanTitle: { fontFamily: fontFamily.bodyBold, fontSize: fontSize.md, color: Colors.navy },
  scanSubtitle: { fontFamily: fontFamily.body, fontSize: fontSize.xs, color: Colors.mutedForeground },
  scanCta: { marginTop: spacing.lg },
});
