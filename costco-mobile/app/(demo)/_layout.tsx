import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { useWarehouseFonts } from '../../constants/fonts.warehouse';
import { WarehouseColorsLight as Colors } from '../../constants/colors.warehouse';

// Standalone route group for the Warehouse Red & Cream design-system demo
// screens (Home, Scan, Badges/Tiers, Price Alerts). Gates rendering on the
// Outfit/Figtree/JetBrains Mono fonts finishing load.
export default function DemoLayout() {
  const fontsLoaded = useWarehouseFonts();

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }} />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
});
