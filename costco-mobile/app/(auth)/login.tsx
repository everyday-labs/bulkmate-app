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
import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { posthog } from '../../lib/posthog';
import { Colors } from '../../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../../constants/theme';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);

  async function signInWithEmail() {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) Alert.alert('Sign in failed', error.message);
    else {
      posthog?.identify(
        data.user.id,
        data.user.email ? { email: data.user.email } : undefined,
      );
      posthog?.capture('user_signed_in', { sign_in_method: 'email' });
    }
    setLoading(false);
  }

  async function signInWithApple() {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken!,
      });
      if (error) Alert.alert('Apple sign-in failed', error.message);
      else {
        posthog?.identify(
          data.user.id,
          data.user.email ? { email: data.user.email } : undefined,
        );
        posthog?.capture('user_signed_in', { sign_in_method: 'apple' });
      }
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Apple sign-in failed', 'Please try again.');
      }
    }
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
          <Text style={styles.tagline}>Warehouse Companion</Text>
        </View>

        {/* ── Form card ── */}
        <View style={styles.card}>
          <Text style={styles.cardHeading}>Sign in</Text>

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
              placeholder="••••••••"
              placeholderTextColor={Colors.gray[400]}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
              secureTextEntry
              autoComplete="password"
              returnKeyType="done"
              onSubmitEditing={signInWithEmail}
            />
          </View>

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
            onPress={signInWithEmail}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={Colors.white} />
              : <Text style={styles.primaryBtnText}>Sign In</Text>
            }
          </Pressable>

          <Pressable onPress={() => router.push('/(auth)/register')} hitSlop={8}>
            <Text style={styles.switchText}>
              New here?{'  '}
              <Text style={styles.switchLink}>Create an account</Text>
            </Text>
          </Pressable>
        </View>

        {/* ── Apple sign-in ── */}
        {Platform.OS === 'ios' && (
          <View style={styles.social}>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerLabel}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={radius.md}
              style={styles.appleBtn}
              onPress={signInWithApple}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing['2xl'] },

  // Brand
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

  // Card
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

  // Fields
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

  // Buttons
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

  // Social
  social: { gap: spacing.lg },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerLabel: { fontSize: fontSize.xs, color: Colors.gray[400], fontWeight: '500' },
  appleBtn: { width: '100%', height: 52 },
});
