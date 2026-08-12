import { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { File, Paths } from 'expo-file-system/next';
import NetInfo from '@react-native-community/netinfo';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { uploadReceipt } from '../lib/receiptUpload';
import { enqueue } from '../lib/offlineQueue';
import { posthog } from '../lib/posthog';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ColorScheme } from '../constants/colors';
import { spacing, fontSize, radius } from '../constants/theme';
import { ScanFrame, type ScanFrameState } from '../components/ScanEffects';

const SUCCESS_HOLD_MS = 850;
const ERROR_HOLD_MS = 1400;

export default function ReceiptCameraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanState, setScanState] = useState<ScanFrameState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const capturing = scanState !== 'idle';
  // The camera viewfinder chrome itself (container/topBar/controls below)
  // stays dark regardless of app theme, matching native camera-app
  // convention — only the pre-permission screen is regular themed app UI.
  const Colors = useThemeColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Camera access is needed to scan receipts.</Text>
        <Pressable
          style={({ pressed }) => [styles.permissionButton, pressed && { opacity: 0.7 }]}
          onPress={requestPermission}
        >
          <Text style={styles.permissionButtonText}>Allow Camera</Text>
        </Pressable>
      </View>
    );
  }

  async function capture() {
    if (!cameraRef.current || capturing) return;
    setScanState('scanning');
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!photo?.uri) throw new Error('No photo captured');

      const dest = new File(Paths.document, `receipt_${Date.now()}.jpg`);
      await new File(photo.uri).copy(dest);
      const destUri = dest.uri;

      const { isConnected } = await NetInfo.fetch();

      if (isConnected) {
        const result = await uploadReceipt(destUri);
        posthog?.capture('receipt_upload_completed', {
          item_count: result.itemCount,
          is_duplicate: result.duplicate,
          has_item_count_mismatch: result.itemCountMismatch,
        });
        setScanState('success');
        setTimeout(() => {
          router.replace(`/receipt-success?receiptId=${result.receiptId}&duplicate=${result.duplicate}`);
        }, SUCCESS_HOLD_MS);
      } else {
        await enqueue(destUri);
        posthog?.capture('receipt_upload_queued_offline');
        setScanState('success');
        setTimeout(() => {
          Alert.alert('Saved', 'Receipt saved. Will upload when connected.');
          router.back();
        }, SUCCESS_HOLD_MS);
      }
    } catch (e: any) {
      posthog?.capture('receipt_upload_failed', { error: e.message ?? String(e) });
      setErrorMessage(e.message ?? 'Something went wrong. Please try again.');
      setScanState('error');
      setTimeout(() => {
        setScanState('idle');
        setErrorMessage(null);
      }, ERROR_HOLD_MS);
    }
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      <ScanFrame
        state={scanState}
        idleLabel="Align receipt in frame"
        scanningLabel="Reading receipt…"
        successLabel="Receipt captured"
        errorLabel="Couldn't read that"
        errorSubLabel={errorMessage ?? undefined}
      />

      {/* Top instruction bar — clears the notch / Dynamic Island */}
      {scanState === 'idle' && (
        <View style={[styles.topBar, { paddingTop: insets.top + spacing.md }]}>
          <Text style={styles.hint}>Lay the receipt flat and capture the full receipt</Text>
        </View>
      )}

      {/* Bottom controls — clears the home indicator. Hidden mid-scan so they
          don't overlap the ScanFrame status pill or get tapped during an
          in-flight upload. */}
      {scanState === 'idle' && (
        <View style={[styles.controls, { bottom: insets.bottom + spacing['3xl'] }]}>
          <Pressable
            style={({ pressed }) => [styles.cancelButton, pressed && { opacity: 0.6 }]}
            onPress={() => router.back()}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.captureButton, pressed && { opacity: 0.8 }]}
            onPress={capture}
          >
            <View style={styles.captureInner} />
          </Pressable>

          <View style={{ width: 64 }} />
        </View>
      )}
    </View>
  );
}

const makeStyles = (Colors: ColorScheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.black },
  permissionContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
  },
  permissionText: {
    fontSize: fontSize.lg,
    color: Colors.gray[700],
    textAlign: 'center',
    marginBottom: spacing['2xl'],
  },
  permissionButton: {
    backgroundColor: Colors.costcoRedSolid,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing['3xl'],
  },
  permissionButtonText: { color: Colors.white, fontSize: fontSize.lg, fontWeight: '600' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing['2xl'],
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
  },
  hint: {
    color: Colors.white,
    fontSize: fontSize.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing['3xl'],
  },
  cancelButton: { width: 64, alignItems: 'center' },
  cancelText: { color: Colors.white, fontSize: fontSize.lg },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.white,
  },
});
