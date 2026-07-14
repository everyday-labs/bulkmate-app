import { useRef, useState } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { radius, shadow, fontSize, spacing } from '../constants/theme';

const TAB_BAR_HEIGHT = 60;

export function ScanFAB() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const rotateAnim  = useRef(new Animated.Value(0)).current;
  const receiptAnim = useRef(new Animated.Value(0)).current;
  const productAnim = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  function toggle() {
    const toValue = open ? 0 : 1;
    Animated.parallel([
      Animated.spring(rotateAnim,   { toValue, useNativeDriver: true, tension: 90, friction: 8 }),
      Animated.spring(receiptAnim,  { toValue, useNativeDriver: true, tension: 90, friction: 8, delay: open ? 0 : 0 }),
      Animated.spring(productAnim,  { toValue, useNativeDriver: true, tension: 90, friction: 8, delay: open ? 0 : 60 }),
      Animated.timing(backdropAnim, { toValue, useNativeDriver: true, duration: 180 }),
    ]).start();
    setOpen(v => !v);
  }

  function navigate(path: '/receipt-camera' | '/product-scan') {
    Animated.parallel([
      Animated.timing(rotateAnim,   { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(receiptAnim,  { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(productAnim,  { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
    ]).start(() => {
      setOpen(false);
      router.push(path);
    });
  }

  const rotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  const receiptStyle = {
    opacity: receiptAnim,
    transform: [{ translateY: receiptAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
    pointerEvents: open ? 'auto' : 'none',
  } as const;

  const productStyle = {
    opacity: productAnim,
    transform: [{ translateY: productAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
    pointerEvents: open ? 'auto' : 'none',
  } as const;

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

        {/* Option: Scan Receipt */}
        <Animated.View style={[styles.optionRow, receiptStyle]}>
          <Text style={styles.optionLabel}>Scan Receipt</Text>
          <Pressable
            style={({ pressed }) => [styles.optionBtn, pressed && styles.optionBtnPressed]}
            onPress={() => navigate('/receipt-camera')}
          >
            <Text style={styles.optionIcon}>🧾</Text>
          </Pressable>
        </Animated.View>

        {/* Option: Scan Product */}
        <Animated.View style={[styles.optionRow, productStyle]}>
          <Text style={styles.optionLabel}>Scan Product</Text>
          <Pressable
            style={({ pressed }) => [styles.optionBtn, pressed && styles.optionBtnPressed]}
            onPress={() => navigate('/product-scan')}
          >
            <Text style={styles.optionIcon}>📦</Text>
          </Pressable>
        </Animated.View>

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
            <Ionicons
              name={open ? 'close' : 'scan'}
              size={26}
              color={Colors.white}
            />
          </Animated.View>
        </Pressable>

      </View>
    </>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: Colors.gray[900],
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
    backgroundColor: Colors.costcoRed,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.lg,
  },
  fabOpen: { backgroundColor: Colors.gray[800] },
  fabPressed: { opacity: 0.9, transform: [{ scale: 0.96 }] },
});
