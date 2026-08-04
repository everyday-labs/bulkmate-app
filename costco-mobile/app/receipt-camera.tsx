import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { File, Paths } from 'expo-file-system/next';
import NetInfo from '@react-native-community/netinfo';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { uploadReceipt } from '../lib/receiptUpload';
import { enqueue } from '../lib/offlineQueue';
import { posthog } from '../lib/posthog';
import { Colors } from '../constants/colors';
import { spacing, fontSize, radius } from '../constants/theme';

export default function ReceiptCameraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Camera access is needed to scan receipts.</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  async function capture() {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
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
        router.replace(`/receipt-success?receiptId=${result.receiptId}&duplicate=${result.duplicate}`);
      } else {
        await enqueue(destUri);
        posthog?.capture('receipt_upload_queued_offline');
        Alert.alert('Saved', 'Receipt saved. Will upload when connected.');
        router.back();
      }
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Something went wrong. Please try again.');
    } finally {
      setCapturing(false);
    }
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      {/* Top instruction bar — clears the notch / Dynamic Island */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.hint}>Lay the receipt flat and capture the full receipt</Text>
      </View>

      {/* Bottom controls — clears the home indicator */}
      <View style={[styles.controls, { bottom: insets.bottom + spacing['3xl'] }]}>
        <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.captureButton} onPress={capture} disabled={capturing}>
          {capturing
            ? <ActivityIndicator color={Colors.white} />
            : <View style={styles.captureInner} />
          }
        </TouchableOpacity>

        <View style={{ width: 64 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.black },
  permissionContainer: {
    flex: 1,
    backgroundColor: Colors.white,
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
    backgroundColor: Colors.costcoRed,
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
