import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../../constants/theme';

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);

  async function signUp() {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Password too short', 'Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      Alert.alert('Sign up failed', error.message);
    } else {
      Alert.alert('Almost there', 'Check your email to confirm your account.');
      router.replace('/(auth)/login');
    }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + spacing['3xl'], paddingBottom: insets.bottom + spacing['3xl'] },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Brand mark ── */}
        <View style={styles.brandSection}>
          <View style={styles.logoMark}>
            <Text style={styles.logoMarkText}>C</Text>
          </View>
          <Text style={styles.wordmark}>COSTCO</Text>
          <Text style={styles.tagline}>Start tracking your savings</Text>
        </View>

        {/* ── Form card ── */}
        <View style={styles.card}>
          <Text style={styles.cardHeading}>Create account</Text>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>EMAIL</Text>
            <TextInput
              style={[styles.input, focused === 'email' && styles.inputFocused]}
              placeholder="you@example.com"
              placeholderTextColor={Colors.gray[400]}
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused(null)}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>PASSWORD</Text>
            <TextInput
              style={[styles.input, focused === 'password' && styles.inputFocused]}
              placeholder="Min. 8 characters"
              placeholderTextColor={Colors.gray[400]}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={signUp}
            />
          </View>

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
            onPress={signUp}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={Colors.white} />
              : <Text style={styles.primaryBtnText}>Create Account</Text>
            }
          </Pressable>

          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={styles.switchText}>
              Already have an account?{'  '}
              <Text style={styles.switchLink}>Sign in</Text>
            </Text>
          </Pressable>
        </View>

        <Text style={styles.legal}>
          By creating an account you agree to our Terms of Service and Privacy Policy.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing['2xl'] },

  brandSection: { alignItems: 'center', marginBottom: spacing['4xl'] },
  logoMark: {
    width: 60,
    height: 60,
    borderRadius: radius['2xl'],
    backgroundColor: Colors.costcoRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadow.md,
  },
  logoMarkText: { color: Colors.white, fontSize: 30, fontWeight: '900' },
  wordmark: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.gray[900],
    letterSpacing: letterSpacing.caps + 2,
    marginBottom: spacing.xs,
  },
  tagline: { fontSize: fontSize.sm, color: Colors.gray[400], letterSpacing: letterSpacing.wide },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: radius['3xl'],
    padding: spacing['2xl'],
    marginBottom: spacing.xl,
    ...shadow.md,
  },
  cardHeading: {
    fontSize: fontSize['3xl'],
    fontWeight: '700',
    color: Colors.gray[900],
    marginBottom: spacing['2xl'],
    letterSpacing: letterSpacing.tight,
  },

  field: { marginBottom: spacing.lg },
  fieldLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: Colors.gray[400],
    letterSpacing: letterSpacing.caps,
    textTransform: 'uppercase',
    marginBottom: spacing.xs - 2,
  },
  input: {
    backgroundColor: Colors.gray[100],
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.md,
    color: Colors.gray[900],
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputFocused: {
    backgroundColor: Colors.surface,
    borderColor: Colors.executiveNavy,
  },

  primaryBtn: {
    backgroundColor: Colors.costcoRed,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    ...shadow.sm,
  },
  primaryBtnPressed: { backgroundColor: Colors.costcoRedDark, opacity: 0.95 },
  primaryBtnText: {
    color: Colors.white,
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: letterSpacing.wide,
  },

  switchText: { textAlign: 'center', fontSize: fontSize.sm, color: Colors.gray[500] },
  switchLink: { color: Colors.executiveNavy, fontWeight: '700' },

  legal: {
    fontSize: 11,
    color: Colors.gray[400],
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: spacing.sm,
  },
});
