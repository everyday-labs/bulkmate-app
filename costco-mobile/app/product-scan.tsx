import { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { posthog } from '../lib/posthog';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ColorScheme } from '../constants/colors';
import { spacing, fontSize, radius, letterSpacing } from '../constants/theme';
import { BarcodeSweep } from '../components/Motion';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

export default function ProductScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Camera viewfinder chrome (topBar/frame/statusOverlay/etc.) stays dark
  // regardless of app theme, matching camera-app convention — only the
  // pre-permission screen below is regular themed app UI.
  const Colors = useThemeColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasScanned = useRef(false); // prevent double-fire

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={[styles.permissionContainer, { paddingTop: insets.top + spacing['3xl'] }]}>
        <BarcodeSweep color={Colors.gray[400]}>
          <Text style={styles.permissionIcon}>📦</Text>
        </BarcodeSweep>
        <Text style={styles.permissionTitle}>Camera Access Needed</Text>
        <Text style={styles.permissionSubtitle}>
          Point your camera at any Costco shelf tag or product barcode to look up pricing.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.permissionBtn, pressed && styles.permissionBtnPressed]}
          onPress={requestPermission}
        >
          <Text style={styles.permissionBtnText}>Allow Camera</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.cancelLink, pressed && { opacity: 0.6 }]}
          onPress={() => router.back()}
          hitSlop={8}
        >
          <Text style={styles.cancelLinkText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  async function onBarcodeScanned({ data }: BarcodeScanningResult) {
    if (hasScanned.current || scanning) return;
    hasScanned.current = true;
    setScanning(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/barcode-lookup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ sku: data }),
      });

      if (res.status === 404) {
        posthog?.capture('product_scan_failed', { reason: 'not_found' });
        setError(`No Costco product found for "${data}". Try scanning the shelf tag instead.`);
        hasScanned.current = false;
        setScanning(false);
        return;
      }

      if (!res.ok) {
        throw new Error(`Lookup failed (${res.status})`);
      }

      const product = await res.json();
      posthog?.capture('product_scan_completed', { lookup_source: 'barcode_scan' });
      // Navigate to product detail — pass the resolved Costco SKU from the API response
      router.replace(`/product/${product.sku}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Something went wrong. Please try again.';
      posthog?.capture('product_scan_failed', { reason: 'error', error: message });
      setError(message);
      hasScanned.current = false;
      setScanning(false);
    }
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14'],
        }}
        onBarcodeScanned={scanning ? undefined : onBarcodeScanned}
      />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.md }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
          hitSlop={8}
        >
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.topTitle}>Scan Product</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Scan frame */}
      <View style={styles.frameWrapper}>
        <View style={styles.frame}>
          {/* Corner accents */}
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
        <Text style={styles.frameHint}>
          Align barcode or shelf tag number within the frame
        </Text>
      </View>

      {/* Status overlay */}
      {scanning && (
        <View style={styles.statusOverlay}>
          <ActivityIndicator size="large" color={Colors.white} />
          <Text style={styles.statusText}>Looking up product…</Text>
        </View>
      )}

      {error && (
        <View style={[styles.errorBanner, { bottom: insets.bottom + spacing['3xl'] }]}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]}
            onPress={() => { setError(null); hasScanned.current = false; }}
          >
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      )}

      {/* Bottom hint */}
      {!scanning && !error && (
        <View style={[styles.bottomHint, { bottom: insets.bottom + spacing['3xl'] }]}>
          <Text style={styles.bottomHintText}>
            Works with shelf price tags and product barcodes
          </Text>
        </View>
      )}
    </View>
  );
}

const FRAME_SIZE = 260;
const CORNER_SIZE = 24;
const CORNER_THICKNESS = 3;

const makeStyles = (Colors: ColorScheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.black },

  // Permission screen
  permissionContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  permissionIcon: { fontSize: 56, marginBottom: spacing.xl },
  permissionTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: Colors.gray[900],
    letterSpacing: letterSpacing.tight,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  permissionSubtitle: {
    fontSize: fontSize.md,
    color: Colors.gray[400],
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing['2xl'],
  },
  permissionBtn: {
    backgroundColor: Colors.costcoRedSolid,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing['3xl'],
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  permissionBtnPressed: { backgroundColor: Colors.costcoRedDark },
  permissionBtnText: { color: Colors.white, fontSize: fontSize.md, fontWeight: '700', letterSpacing: letterSpacing.wide },
  cancelLink: { paddingVertical: spacing.md },
  cancelLinkText: { color: Colors.gray[400], fontSize: fontSize.md },

  // Top bar
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backBtn: { width: 60 },
  backText: { color: Colors.white, fontSize: fontSize.xl, fontWeight: '500' },
  topTitle: { color: Colors.white, fontSize: fontSize.lg, fontWeight: '700' },

  // Scan frame
  frameWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    position: 'relative',
    marginBottom: spacing.xl,
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderColor: Colors.white,
    borderTopLeftRadius: radius.sm,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderColor: Colors.white,
    borderTopRightRadius: radius.sm,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderColor: Colors.white,
    borderBottomLeftRadius: radius.sm,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderColor: Colors.white,
    borderBottomRightRadius: radius.sm,
  },
  frameHint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: fontSize.sm,
    textAlign: 'center',
    letterSpacing: letterSpacing.normal,
    paddingHorizontal: spacing['2xl'],
  },

  // Scanning overlay
  statusOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  statusText: {
    color: Colors.white,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },

  // Error banner
  errorBanner: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: Colors.gray[700],
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    backgroundColor: Colors.costcoRedSolid,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  retryText: { color: Colors.white, fontSize: fontSize.sm, fontWeight: '700' },

  // Bottom hint
  bottomHint: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bottomHintText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: fontSize.xs,
    letterSpacing: letterSpacing.wide,
  },
});
