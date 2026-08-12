import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ColorScheme } from '../constants/colors';
import { spacing, fontSize, letterSpacing } from '../constants/theme';
import type { PostHogErrorBoundaryFallbackProps } from 'posthog-react-native';

// Rendered by PostHogErrorBoundary in _layout.tsx when a React render error
// escapes the tree. The crash itself is already captured and sent to
// PostHog by the boundary before this renders — this is just the recovery
// screen the user sees.
export function ErrorFallback(_props: PostHogErrorBoundaryFallbackProps) {
  const Colors = useThemeColors();
  const styles = makeStyles(Colors);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing['3xl'], paddingBottom: insets.bottom + spacing['3xl'] }]}>
      <Text style={styles.icon}>⚠️</Text>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.subtitle}>
        The app hit an unexpected error. Close and reopen Bulkmate to
        keep going — this has already been reported.
      </Text>
    </View>
  );
}

const makeStyles = (Colors: ColorScheme) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  icon: { fontSize: 48, marginBottom: spacing.xl },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: Colors.gray[900],
    marginBottom: spacing.sm,
    letterSpacing: letterSpacing.tight,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.md,
    color: Colors.gray[400],
    textAlign: 'center',
    lineHeight: 22,
  },
});
