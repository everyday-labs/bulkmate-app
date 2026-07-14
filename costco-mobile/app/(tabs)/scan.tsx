import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { Colors } from '../../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../../constants/theme';

export default function ScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  // Derive a friendly first name from email
  const firstName = session?.user.email?.split('@')[0]
    ?.replace(/[._-]/g, ' ')
    ?.split(' ')[0]
    ?.replace(/^\w/, c => c.toUpperCase()) ?? 'there';

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
      {/* ── Greeting ── */}
      <View style={styles.greeting}>
        <Text style={styles.greetingHello}>Hello, {firstName}</Text>
        <Text style={styles.greetingQuestion}>What would you like to do?</Text>
      </View>

      {/* ── Primary action — Scan Receipt ── */}
      <Pressable
        style={({ pressed }) => [styles.primaryCard, pressed && styles.cardPressed]}
        onPress={() => router.push('/receipt-camera')}
      >
        {/* Red accent band */}
        <View style={styles.primaryCardAccent} />

        <View style={styles.primaryCardContent}>
          <View style={styles.primaryIconWrap}>
            <Text style={styles.primaryIcon}>🧾</Text>
          </View>
          <View style={styles.primaryCardText}>
            <Text style={styles.primaryCardTitle}>Scan Receipt</Text>
            <Text style={styles.primaryCardDesc}>
              Track purchases, get price-match alerts, and build your savings history.
            </Text>
          </View>
          <View style={styles.arrowWrap}>
            <Text style={styles.arrow}>›</Text>
          </View>
        </View>
      </Pressable>

      {/* ── Secondary action — Scan Product ── */}
      <Pressable
        style={({ pressed }) => [styles.secondaryCard, pressed && styles.cardPressed]}
        onPress={() => router.push('/product-scan')}
      >
        <View style={styles.secondaryCardContent}>
          <View style={styles.secondaryIconWrap}>
            <Text style={styles.secondaryIcon}>📦</Text>
          </View>
          <View style={styles.secondaryCardText}>
            <Text style={styles.secondaryCardTitle}>Scan Product</Text>
            <Text style={styles.secondaryCardDesc}>
              Look up pricing, reviews, and inventory
            </Text>
          </View>
          <View style={styles.arrowWrap}>
            <Text style={styles.arrow}>›</Text>
          </View>
        </View>
      </Pressable>

      {/* ── Divider ── */}
      <View style={styles.divider} />

      {/* ── Receipt history link ── */}
      <Pressable
        style={({ pressed }) => [styles.historyRow, pressed && styles.historyRowPressed]}
        onPress={() => router.push('/receipts')}
      >
        <View style={styles.historyLeft}>
          <Text style={styles.historyIcon}>🗂</Text>
          <View>
            <Text style={styles.historyTitle}>Receipt History</Text>
            <Text style={styles.historySubtitle}>View all your past scans</Text>
          </View>
        </View>
        <Text style={styles.historyChevron}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: spacing['2xl'],
  },

  // Greeting
  greeting: { marginBottom: spacing['3xl'] },
  greetingHello: {
    fontSize: fontSize['4xl'],
    fontWeight: '800',
    color: Colors.gray[900],
    letterSpacing: letterSpacing.tight,
    marginBottom: spacing.xs,
  },
  greetingQuestion: {
    fontSize: fontSize.md,
    color: Colors.gray[400],
    letterSpacing: letterSpacing.normal,
  },

  // Primary card
  primaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: radius['2xl'],
    marginBottom: spacing.lg,
    overflow: 'hidden',
    ...shadow.md,
  },
  cardPressed: { opacity: 0.94, transform: [{ scale: 0.985 }] },
  primaryCardAccent: {
    height: 4,
    backgroundColor: Colors.costcoRed,
  },
  primaryCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  primaryIconWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.xl,
    backgroundColor: Colors.costcoRedSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryIcon: { fontSize: 26 },
  primaryCardText: { flex: 1 },
  primaryCardTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: Colors.gray[900],
    marginBottom: spacing.xs,
    letterSpacing: letterSpacing.tight,
  },
  primaryCardDesc: {
    fontSize: fontSize.sm,
    color: Colors.gray[500],
    lineHeight: 19,
  },
  arrowWrap: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: Colors.costcoRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: { color: Colors.white, fontSize: 18, fontWeight: '700', marginTop: -1 },

  // Secondary card
  secondaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: radius['2xl'],
    marginBottom: spacing.xl,
    overflow: 'hidden',
    ...shadow.sm,
  },
  secondaryCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  secondaryIconWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.xl,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryIcon: { fontSize: 26 },
  secondaryCardText: { flex: 1 },
  secondaryCardTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: Colors.gray[900],
    marginBottom: spacing.xs,
    letterSpacing: letterSpacing.tight,
  },
  secondaryCardDesc: {
    fontSize: fontSize.sm,
    color: Colors.gray[500],
    lineHeight: 19,
  },
  comingSoonBadge: {
    backgroundColor: Colors.gray[100],
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs - 1,
    borderRadius: radius.sm,
  },
  comingSoonText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.gray[400],
    letterSpacing: letterSpacing.caps,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginBottom: spacing.xl,
  },

  // History row
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    backgroundColor: Colors.surface,
    borderRadius: radius.xl,
    ...shadow.sm,
  },
  historyRowPressed: { opacity: 0.88 },
  historyLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  historyIcon: { fontSize: 22 },
  historyTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: Colors.gray[800],
    marginBottom: 2,
  },
  historySubtitle: { fontSize: fontSize.sm, color: Colors.gray[400] },
  historyChevron: { fontSize: 22, color: Colors.gray[300], fontWeight: '300' },
});
