import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { File, Paths } from 'expo-file-system/next';
import NetInfo from '@react-native-community/netinfo';
import { useRouter } from 'expo-router';
import { uploadReceipt } from '../lib/receiptUpload';
import { enqueue } from '../lib/offlineQueue';
import { Colors } from '../constants/colors';

export default function ReceiptCameraScreen() {
  const router = useRouter();
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

      // Copy to persistent local storage
      const dest = new File(Paths.document, `receipt_${Date.now()}.jpg`);
      await new File(photo.uri).copy(dest);
      const destUri = dest.uri;

      const { isConnected } = await NetInfo.fetch();

      if (isConnected) {
        const result = await uploadReceipt(destUri);
        router.replace(`/receipt-success?receiptId=${result.receiptId}&duplicate=${result.duplicate}`);
      } else {
        await enqueue(destUri);
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

      {/* Top instruction bar */}
      <View style={styles.topBar}>
        <Text style={styles.hint}>Lay the receipt flat and capture the full receipt</Text>
      </View>

      {/* Bottom controls */}
      <View style={styles.controls}>
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
    padding: 24,
  },
  permissionText: { fontSize: 16, color: Colors.gray[700], textAlign: 'center', marginBottom: 24 },
  permissionButton: {
    backgroundColor: Colors.costcoRed,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  permissionButtonText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
  },
  hint: {
    color: Colors.white,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  controls: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
  },
  cancelButton: { width: 64, alignItems: 'center' },
  cancelText: { color: Colors.white, fontSize: 16 },
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
