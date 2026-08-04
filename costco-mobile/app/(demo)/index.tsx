import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WarehouseColorsLight as Colors } from '../../constants/colors.warehouse';
import { fontFamily, fontSize, radius, spacing } from '../../constants/theme.warehouse';
import { Card, Button } from '../../components/warehouse/ui';
import { FadeUpView } from '../../components/warehouse/WarehouseMotion';

const SCREENS = [
  { href: '/(demo)/home', title: 'Home Dashboard', subtitle: 'Bento grid — tier, stars, alerts, spend', icon: '🏠' },
  { href: '/(demo)/scan', title: 'Scan Receipt', subtitle: 'Camera placeholder → scan → success', icon: '🧾' },
  { href: '/(demo)/badges', title: 'Badges & Tiers', subtitle: 'Achievement grid, tier ladder', icon: '🏅' },
  { href: '/(demo)/alerts', title: 'Price Alerts', subtitle: 'Recent drops with savings', icon: '🏷' },
] as const;

export default function DemoIndex() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing['2xl'] }]}
    >
      <Text style={styles.eyebrow}>DESIGN SYSTEM PREVIEW</Text>
      <Text style={styles.title}>Warehouse Red & Cream</Text>
      <Text style={styles.subtitle}>
        Interactive demo screens for the {new Date(2026, 7, 4).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} design plan. Fake data only — nothing here touches Supabase.
      </Text>

      <View style={styles.list}>
        {SCREENS.map((s, i) => (
          <FadeUpView key={s.href} index={i} style={styles.cardWrap}>
            <Card style={styles.card}>
              <View style={styles.iconWrap}>
                <Text style={styles.icon}>{s.icon}</Text>
              </View>
              <View style={styles.body}>
                <Text style={styles.cardTitle}>{s.title}</Text>
                <Text style={styles.cardSubtitle}>{s.subtitle}</Text>
              </View>
              <View style={styles.ctaWrap}>
                <Button title="Open" variant="secondary" onPress={() => router.push(s.href)} />
              </View>
            </Card>
          </FadeUpView>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: spacing.lg },
  eyebrow: {
    fontFamily: fontFamily.bodySemibold,
    fontSize: fontSize.xs,
    color: Colors.primary,
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: fontSize['4xl'],
    color: Colors.navy,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontFamily: fontFamily.body,
    fontSize: fontSize.md,
    color: Colors.mutedForeground,
    lineHeight: 22,
    marginBottom: spacing['2xl'],
  },
  list: { gap: spacing.md },
  cardWrap: {},
  card: { gap: spacing.md },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: Colors.creamDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 22 },
  body: { gap: 2 },
  cardTitle: { fontFamily: fontFamily.bodyBold, fontSize: fontSize.lg, color: Colors.navy },
  cardSubtitle: { fontFamily: fontFamily.body, fontSize: fontSize.sm, color: Colors.mutedForeground },
  ctaWrap: { alignItems: 'flex-start' },
});
