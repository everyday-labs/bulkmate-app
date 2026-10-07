import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../contexts/ThemeContext';
import type { ColorScheme } from '../../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../../constants/theme';
import { useCheckIn } from '../../hooks/useCheckIn';
import { CheckInModal, TooFarModal } from '../../components/CheckInModals';
import { ScanLineIcon, PinPulse, BarcodeSweep } from '../../components/Motion';

type ScanMode = 'receipt' | 'barcode' | 'checkin';

const MODES: { key: ScanMode; label: string; icon: string }[] = [
  { key: 'receipt', label: 'Receipt', icon: '🧾' },
  { key: 'barcode', label: 'Barcode', icon: '📦' },
  { key: 'checkin', label: 'Check-in', icon: '📍' },
];

const MODE_CONTENT: Record<
  ScanMode,
  {
    title: string;
    description: string;
    tips: string[];
    ctaLabel: string;
  }
> = {
  receipt: {
    title: 'Scan Receipt',
    description: 'Track purchases, get price-match alerts, and build your savings history.',
    tips: [
      'Flatten the receipt on a dark surface',
      'Fit the whole receipt inside the frame',
      'Hold still until the sweep finishes',
    ],
    ctaLabel: 'Open Camera',
  },
  barcode: {
    title: 'Scan Product',
    description: 'Point at any item barcode to see price history and adjustment eligibility.',
    tips: [
      'Center the barcode in the frame',
      'Avoid glare from warehouse lights',
      'Works on shelf tags too',
    ],
    ctaLabel: 'Open Camera',
  },
  checkin: {
    title: 'Check In',
    description: 'Check in at a warehouse to earn a star toward your fan tier.',
    tips: [
      'Turn on location access',
      'Stand within 50m of the warehouse entrance',
      'Tap "Check My Location" to bank your star',
    ],
    ctaLabel: 'Check My Location',
  },
};

const HISTORY_CONTENT: Record<
  ScanMode,
  { icon: string; title: string; subtitle: string; route: string }
> = {
  receipt: {
    icon: '🗂',
    title: 'Receipt History',
    subtitle: 'View all your past scans',
    route: '/receipts',
  },
  barcode: {
    icon: '📋',
    title: 'Barcode History',
    subtitle: 'View all your past lookups',
    route: '/barcode-history',
  },
  checkin: {
    icon: '🕑',
    title: 'Check-In History',
    subtitle: 'View all your past visits',
    route: '/checkin-history',
  },
};

export default function ScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mode: requestedMode } = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<ScanMode>(
    requestedMode === 'barcode' || requestedMode === 'checkin' ? requestedMode : 'receipt',
  );
  const Colors = useThemeColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { checkingIn, checkInResult, tooFarInfo, runCheckIn, clearCheckInResult, clearTooFarInfo } =
    useCheckIn();

  // The tab stays mounted across visits, so `mode` must re-sync whenever a
  // new `?mode=` param arrives (e.g. tapping a different ScanFAB action) —
  // the useState initializer above only ran once, on first mount.
  useEffect(() => {
    if (requestedMode === 'receipt' || requestedMode === 'barcode' || requestedMode === 'checkin') {
      setMode(requestedMode);
    }
  }, [requestedMode]);

  const content = MODE_CONTENT[mode];

  function handleCta() {
    if (mode === 'receipt') router.push('/receipt-camera');
    else if (mode === 'barcode') router.push('/product-scan');
    else runCheckIn();
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
      <Text style={styles.heading}>Scan</Text>

      {/* ── Mode switcher ── */}
      <View style={styles.modeRow}>
        {MODES.map((m) => {
          const active = m.key === mode;
          return (
            <Pressable
              key={m.key}
              style={({ pressed }) => [
                styles.modeTab,
                active && styles.modeTabActive,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => setMode(m.key)}
            >
              <Text style={styles.modeIcon}>{m.icon}</Text>
              <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Mode content card ── */}
      <View style={styles.card}>
        <View style={styles.cardAccent} />
        <View style={styles.cardBody}>
          <View style={styles.cardIconWrap}>
            {mode === 'receipt' ? (
              <ScanLineIcon>
                <Text style={styles.cardIcon}>{MODES.find((m) => m.key === mode)!.icon}</Text>
              </ScanLineIcon>
            ) : mode === 'checkin' ? (
              <PinPulse color={Colors.costcoRed + '80'}>
                <Text style={styles.cardIcon}>{MODES.find((m) => m.key === mode)!.icon}</Text>
              </PinPulse>
            ) : (
              <BarcodeSweep>
                <Text style={styles.cardIcon}>{MODES.find((m) => m.key === mode)!.icon}</Text>
              </BarcodeSweep>
            )}
          </View>
          <Text style={styles.cardTitle}>{content.title}</Text>
          <Text style={styles.cardDescription}>{content.description}</Text>

          <View style={styles.tipsList}>
            {content.tips.map((tip, i) => (
              <View key={tip} style={styles.tipRow}>
                <View style={styles.tipNumber}>
                  <Text style={styles.tipNumberText}>{i + 1}</Text>
                </View>
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.ctaButton,
              pressed && styles.ctaButtonPressed,
              mode === 'checkin' && checkingIn && styles.ctaButtonMuted,
            ]}
            onPress={handleCta}
            disabled={mode === 'checkin' && checkingIn}
          >
            {mode === 'checkin' && checkingIn ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.ctaButtonText}>{content.ctaLabel}</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* ── Mode-specific history link ── */}
      <Pressable
        style={({ pressed }) => [styles.historyRow, pressed && styles.historyRowPressed]}
        onPress={() => router.push(HISTORY_CONTENT[mode].route as any)}
      >
        <View style={styles.historyLeft}>
          <Text style={styles.historyIcon}>{HISTORY_CONTENT[mode].icon}</Text>
          <View>
            <Text style={styles.historyTitle}>{HISTORY_CONTENT[mode].title}</Text>
            <Text style={styles.historySubtitle}>{HISTORY_CONTENT[mode].subtitle}</Text>
          </View>
        </View>
        <Text style={styles.historyChevron}>›</Text>
      </Pressable>

      {checkInResult && (
        <CheckInModal result={checkInResult} onClose={clearCheckInResult} Colors={Colors} />
      )}
      {tooFarInfo && (
        <TooFarModal
          miles={tooFarInfo.miles}
          warehouse={tooFarInfo.warehouse}
          onClose={clearTooFarInfo}
          Colors={Colors}
        />
      )}
    </View>
  );
}

const makeStyles = (Colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
      paddingHorizontal: spacing['2xl'],
    },
    heading: {
      fontSize: fontSize['4xl'],
      fontWeight: '800',
      color: Colors.gray[900],
      letterSpacing: letterSpacing.tight,
      marginBottom: spacing.lg,
    },

    // Mode switcher
    modeRow: {
      flexDirection: 'row',
      backgroundColor: Colors.gray[100],
      borderRadius: radius.xl,
      padding: spacing.xs,
      gap: spacing.xs,
      marginBottom: spacing.xl,
    },
    modeTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.lg,
    },
    modeTabActive: {
      backgroundColor: Colors.surface,
      ...shadow.sm,
    },
    modeIcon: { fontSize: 15 },
    modeLabel: { fontSize: fontSize.sm, fontWeight: '600', color: Colors.gray[400] },
    modeLabelActive: { color: Colors.gray[900], fontWeight: '700' },

    // Mode content card
    card: {
      backgroundColor: Colors.surface,
      borderRadius: radius['2xl'],
      marginBottom: spacing.xl,
      overflow: 'hidden',
      ...shadow.md,
    },
    cardAccent: { height: 4, backgroundColor: Colors.costcoRed },
    cardBody: { padding: spacing.xl },
    cardIconWrap: {
      width: 52,
      height: 52,
      borderRadius: radius.xl,
      backgroundColor: Colors.costcoRedSubtle,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    cardIcon: { fontSize: 26 },
    cardTitle: {
      fontSize: fontSize.xl,
      fontWeight: '700',
      color: Colors.gray[900],
      marginBottom: spacing.xs,
      letterSpacing: letterSpacing.tight,
    },
    cardDescription: {
      fontSize: fontSize.sm,
      color: Colors.gray[500],
      lineHeight: 19,
      marginBottom: spacing.lg,
    },

    tipsList: { gap: spacing.sm, marginBottom: spacing.xl },
    tipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    tipNumber: {
      width: 22,
      height: 22,
      borderRadius: radius.pill,
      backgroundColor: Colors.executiveNavySubtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tipNumberText: { fontSize: 11, fontWeight: '700', color: Colors.executiveNavy },
    tipText: { flex: 1, fontSize: fontSize.sm, color: Colors.gray[700] },

    ctaButton: {
      backgroundColor: Colors.costcoRedSolid,
      borderRadius: radius.lg,
      paddingVertical: spacing.lg,
      alignItems: 'center',
      ...shadow.sm,
    },
    ctaButtonPressed: { backgroundColor: Colors.costcoRedDark },
    ctaButtonMuted: { opacity: 0.7 },
    ctaButtonText: {
      color: Colors.white,
      fontSize: fontSize.md,
      fontWeight: '700',
      letterSpacing: letterSpacing.wide,
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
