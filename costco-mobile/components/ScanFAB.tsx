import { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ColorScheme } from '../constants/colors';
import { radius, shadow, fontSize, spacing } from '../constants/theme';

const TAB_BAR_HEIGHT = 60;

type ScanMode = 'receipt' | 'barcode' | 'checkin';

const ACTIONS: { mode: ScanMode; label: string; icon: string }[] = [
  { mode: 'receipt', label: 'Scan Receipt', icon: '🧾' },
  { mode: 'barcode', label: 'Scan Product', icon: '📦' },
  { mode: 'checkin', label: 'Check In', icon: '📍' },
];

export function ScanFAB() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const [open, setOpen] = useState(false);

  const rotateAnim = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const actionAnims = useRef(ACTIONS.map(() => new Animated.Value(0))).current;

  function toggle() {
    const toValue = open ? 0 : 1;
    Animated.parallel([
      Animated.spring(rotateAnim, { toValue, useNativeDriver: true, tension: 90, friction: 8 }),
      ...actionAnims.map((anim, i) =>
        Animated.spring(anim, {
          toValue,
          useNativeDriver: true,
          tension: 90,
          friction: 8,
          delay: open ? 0 : i * 60,
        }),
      ),
      Animated.timing(backdropAnim, { toValue, useNativeDriver: true, duration: 180 }),
    ]).start();
    setOpen((v) => !v);
  }

  function navigate(mode: ScanMode) {
    Animated.parallel([
      Animated.timing(rotateAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      ...actionAnims.map((anim) =>
        Animated.timing(anim, { toValue: 0, duration: 120, useNativeDriver: true }),
      ),
      Animated.timing(backdropAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
    ]).start(() => {
      setOpen(false);
      router.push({ pathname: '/(tabs)/scan', params: { mode } });
    });
  }

  const rotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });
  const bottom = TAB_BAR_HEIGHT + insets.bottom + 16;

  return (
    <>
      {/* Dimmed backdrop — tapping it closes the dial */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: 'rgba(0,0,0,0.35)', opacity: backdropAnim },
          !open && { pointerEvents: 'none' },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={toggle} />
      </Animated.View>

      <View style={[styles.container, { bottom }]} pointerEvents="box-none">
        {ACTIONS.map((action, i) => {
          const anim = actionAnims[i];
          const actionStyle = {
            opacity: anim,
            transform: [
              { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
            ],
            pointerEvents: open ? ('auto' as const) : ('none' as const),
          };
          return (
            <Animated.View key={action.mode} style={[styles.optionRow, actionStyle]}>
              <Text style={styles.optionLabel}>{action.label}</Text>
              <Pressable
                style={({ pressed }) => [styles.optionBtn, pressed && styles.optionBtnPressed]}
                onPress={() => navigate(action.mode)}
              >
                <Text style={styles.optionIcon}>{action.icon}</Text>
              </Pressable>
            </Animated.View>
          );
        })}

        {/* Main FAB */}
        <Pressable
          style={({ pressed }) => [
            styles.fab,
            open && styles.fabOpen,
            pressed && styles.fabPressed,
          ]}
          onPress={toggle}
        >
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Ionicons name={open ? 'close' : 'scan'} size={26} color={Colors.white} />
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
}

const makeStyles = (Colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      right: spacing['2xl'],
      alignItems: 'flex-end',
      gap: spacing.md,
    },

    // Speed-dial options
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    optionLabel: {
      backgroundColor: Colors.darkSolid,
      color: Colors.white,
      fontSize: fontSize.sm,
      fontWeight: '700',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.lg,
      overflow: 'hidden',
    },
    optionBtn: {
      width: 48,
      height: 48,
      borderRadius: radius.pill,
      backgroundColor: Colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow.md,
    },
    optionBtnPressed: { opacity: 0.8, transform: [{ scale: 0.95 }] },
    optionIcon: { fontSize: 22 },

    // Main FAB
    fab: {
      width: 60,
      height: 60,
      borderRadius: radius.pill,
      backgroundColor: Colors.costcoRedSolid,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow.lg,
    },
    fabOpen: { backgroundColor: Colors.darkSolid },
    fabPressed: { opacity: 0.9, transform: [{ scale: 0.96 }] },
  });
