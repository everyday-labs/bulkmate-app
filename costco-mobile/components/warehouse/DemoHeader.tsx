import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WarehouseColorsLight as Colors } from '../../constants/colors.warehouse';
import { fontFamily, fontSize, spacing } from '../../constants/theme.warehouse';

export function DemoHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.row}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
        <Text style={styles.backIcon}>‹</Text>
      </Pressable>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.spacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { fontSize: 26, color: Colors.navy, fontFamily: fontFamily.bodyBold },
  title: { fontFamily: fontFamily.bodySemibold, fontSize: fontSize.sm, color: Colors.mutedForeground, letterSpacing: 1 },
  spacer: { width: 32 },
});
