import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WarehouseColorsLight as Colors } from '../../constants/colors.warehouse';
import { fontFamily, fontSize, radius, spacing } from '../../constants/theme.warehouse';
import { AlertTile, Card, SectionLabel } from '../../components/warehouse/ui';
import { FadeUpView } from '../../components/warehouse/WarehouseMotion';
import { DemoHeader } from '../../components/warehouse/DemoHeader';

const ALERTS = [
  { id: '1', name: 'Kirkland Almonds 3lb', paid: 14.99, current: 10.49, delta: 4.5 },
  { id: '2', name: 'Bounty Paper Towels 12 Rolls', paid: 21.49, current: 19.19, delta: 2.3 },
  { id: '3', name: "Kirkland Cold Brew Coffee 12pk", paid: 12.99, current: 10.49, delta: 2.5 },
  { id: '4', name: 'Charmin Ultra Soft 24 Mega Rolls', paid: 26.99, current: 24.29, delta: 2.7 },
];

export default function DemoAlertsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [alerts] = useState(ALERTS);
  const totalOwed = alerts.reduce((sum, a) => sum + a.delta, 0);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing['2xl'] }]}
      showsVerticalScrollIndicator={false}
    >
      <DemoHeader title="Price Alerts" onBack={() => router.back()} />

      <FadeUpView index={0} style={styles.section}>
        <Card variant="featured">
          <SectionLabel>
            <Text style={styles.summaryLabel}>YOU MAY BE OWED</Text>
          </SectionLabel>
          <Text style={styles.summaryValue}>${totalOwed.toFixed(2)}</Text>
          <Text style={styles.summarySub}>
            Across {alerts.length} {alerts.length === 1 ? 'item' : 'items'} from the last 30 days
          </Text>
        </Card>
      </FadeUpView>

      <FadeUpView index={1}>
        <SectionLabel>Recent Drops</SectionLabel>
      </FadeUpView>

      <View style={styles.list}>
        {alerts.map((a) => (
          <AlertTile
            key={a.id}
            name={a.name}
            paidPrice={a.paid}
            currentPrice={a.current}
            delta={a.delta}
          />
        ))}
      </View>

      {alerts.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🏷</Text>
          <Text style={styles.emptyTitle}>No price drops yet</Text>
          <Text style={styles.emptySubtitle}>
            We'll notify you the moment something you bought goes on sale.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: spacing.lg },
  section: { marginBottom: spacing.xl },
  summaryLabel: { fontFamily: fontFamily.bodySemibold, fontSize: fontSize.xs, color: 'rgba(245,239,230,0.65)', letterSpacing: 1.2 },
  summaryValue: { fontFamily: fontFamily.display, fontSize: fontSize.display, color: Colors.gold, marginTop: spacing.xs },
  summarySub: { fontFamily: fontFamily.body, fontSize: fontSize.sm, color: 'rgba(245,239,230,0.75)', marginTop: spacing.xs },
  list: { gap: spacing.sm, marginTop: spacing.md },
  empty: {
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: radius.xl,
    padding: spacing['3xl'],
    marginTop: spacing.lg,
  },
  emptyIcon: { fontSize: 44, marginBottom: spacing.md },
  emptyTitle: { fontFamily: fontFamily.bodyBold, fontSize: fontSize.lg, color: Colors.navy, marginBottom: spacing.xs },
  emptySubtitle: { fontFamily: fontFamily.body, fontSize: fontSize.sm, color: Colors.mutedForeground, textAlign: 'center' },
});
