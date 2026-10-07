import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ColorScheme } from '../constants/colors';

export default function NotFoundScreen() {
  const Colors = useThemeColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Screen not found</Text>
      <Link href="/" style={styles.link}>
        Go home
      </Link>
    </View>
  );
}

const makeStyles = (Colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.background,
    },
    title: { fontSize: 20, color: Colors.gray[700] },
    link: { marginTop: 16, color: Colors.costcoRed },
  });
