import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/colors';

export default function ScanScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scan</Text>
      <Text style={styles.subtitle}>What would you like to scan?</Text>

      <TouchableOpacity style={styles.card} onPress={() => router.push('/receipt-camera')}>
        <Text style={styles.cardIcon}>🧾</Text>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>Scan Receipt</Text>
          <Text style={styles.cardDescription}>Upload a receipt to track purchases and get price match alerts</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.card, styles.cardDisabled]}>
        <Text style={styles.cardIcon}>📦</Text>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>Scan Product</Text>
          <Text style={[styles.cardDescription, { color: Colors.gray[300] }]}>Look up product info and pricing — coming soon</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.historyLink} onPress={() => router.push('/receipts')}>
        <Text style={styles.historyLinkText}>View Receipt History</Text>
        <Text style={styles.historyChevron}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: 24,
    paddingTop: 64,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.executiveNavy,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.gray[500],
    marginBottom: 32,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[300],
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  cardIcon: {
    fontSize: 36,
    marginRight: 16,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.executiveNavy,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 13,
    color: Colors.gray[500],
    lineHeight: 18,
  },
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  historyLinkText: {
    fontSize: 15,
    color: Colors.executiveNavy,
    fontWeight: '600',
  },
  historyChevron: {
    fontSize: 20,
    color: Colors.gray[500],
  },
});
