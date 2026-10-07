import { useMemo, useState } from 'react';
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
import Svg, { Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { posthog } from '../../lib/posthog';
import { googleSignInAvailable, getGoogleIdToken } from '../../lib/googleSignIn';
import { useThemeColors } from '../../contexts/ThemeContext';
import type { ColorScheme } from '../../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../../constants/theme';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);

  async function signInWithEmail() {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error?.code === 'email_not_confirmed') {
      // Signed up but never entered the code — send a fresh one and finish
      // verification instead of leaving them stuck on a dead-end error.
      posthog?.capture('sign_in_failed', { sign_in_method: 'email', error: error.message });
      await supabase.auth.resend({ type: 'signup', email: email.trim() });
      setLoading(false);
      router.push({ pathname: '/(auth)/register', params: { verifyEmail: email.trim() } });
      return;
    }
    if (error) {
      posthog?.capture('sign_in_failed', { sign_in_method: 'email', error: error.message });
      Alert.alert('Sign in failed', error.message);
    } else {
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
      if (error) {
        posthog?.capture('sign_in_failed', { sign_in_method: 'apple', error: error.message });
        Alert.alert('Apple sign-in failed', error.message);
      } else {
        // Apple only returns the name on the user's first-ever Apple sign-in,
        // and never puts it in the ID token, so the signup trigger can't see
        // it. Save it now; `is first_name null` keeps a name the user already
        // set from being overwritten.
        const { givenName, familyName } = credential.fullName ?? {};
        if (givenName || familyName) {
          await supabase
            .from('profiles')
            .update({
              first_name: givenName ?? null,
              last_name: familyName ?? null,
              display_name: [givenName, familyName].filter(Boolean).join(' '),
            })
            .eq('id', data.user.id)
            .is('first_name', null);
        }
        posthog?.identify(
          data.user.id,
          data.user.email ? { email: data.user.email } : undefined,
        );
        posthog?.capture('user_signed_in', { sign_in_method: 'apple' });
      }
    } catch (e: any) {
      // User cancelling the Apple sheet isn't a failure worth tracking.
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        posthog?.capture('sign_in_failed', { sign_in_method: 'apple', error: e.message ?? String(e) });
        Alert.alert('Apple sign-in failed', 'Please try again.');
      }
    }
  }

  async function signInWithGoogle() {
    setGoogleLoading(true);
    try {
      const idToken = await getGoogleIdToken();
      if (!idToken) return; // user closed the Google sheet
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (error) {
        posthog?.capture('sign_in_failed', { sign_in_method: 'google', error: error.message });
        Alert.alert('Google sign-in failed', error.message);
      } else {
        posthog?.identify(
          data.user.id,
          data.user.email ? { email: data.user.email } : undefined,
        );
        posthog?.capture('user_signed_in', { sign_in_method: 'google' });
      }
    } catch (e: any) {
      posthog?.capture('sign_in_failed', { sign_in_method: 'google', error: e.message ?? String(e) });
      Alert.alert('Google sign-in failed', 'Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }

  const showSocial = Platform.OS === 'ios' || googleSignInAvailable;

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
            <Text style={styles.logoMarkText}>B</Text>
          </View>
          <Text style={styles.wordmark}>BULKMATE</Text>
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
            <Pressable
              onPress={() => router.push('/(auth)/forgot-password')}
              hitSlop={8}
              style={({ pressed }) => [styles.forgotLink, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>
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

          <Pressable
            onPress={() => router.push('/(auth)/register')}
            hitSlop={8}
            style={({ pressed }) => pressed && { opacity: 0.6 }}
          >
            <Text style={styles.switchText}>
              New here?{'  '}
              <Text style={styles.switchLink}>Create an account</Text>
            </Text>
          </Pressable>
        </View>

        {/* ── Social sign-in ── */}
        {showSocial && (
          <View style={styles.social}>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerLabel}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>
            {Platform.OS === 'ios' && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={radius.md}
                style={styles.appleBtn}
                onPress={signInWithApple}
              />
            )}
            {googleSignInAvailable && (
              <Pressable
                style={({ pressed }) => [styles.googleBtn, pressed && { opacity: 0.7 }]}
                onPress={signInWithGoogle}
                disabled={googleLoading}
                accessibilityRole="button"
                accessibilityLabel="Sign in with Google"
              >
                {googleLoading ? (
                  <ActivityIndicator color={Colors.gray[900]} />
                ) : (
                  <>
                    <GoogleMark />
                    <Text style={styles.googleBtnText}>Sign in with Google</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Google's multicolor "G" — brand guidelines require the official mark on sign-in buttons.
function GoogleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

const makeStyles = (Colors: ColorScheme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing['2xl'] },

  // Brand
  brandSection: { alignItems: 'center', marginBottom: spacing['4xl'] },
  logoMark: {
    width: 60,
    height: 60,
    borderRadius: radius['2xl'],
    backgroundColor: Colors.costcoRedSolid,
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
  forgotLink: { alignSelf: 'flex-end', marginTop: spacing.sm },
  forgotText: { fontSize: fontSize.sm, color: Colors.executiveNavy, fontWeight: '600' },

  // Buttons
  primaryBtn: {
    backgroundColor: Colors.costcoRedSolid,
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
  googleBtn: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  googleBtnText: { fontSize: 19, fontWeight: '600', color: Colors.gray[900] },
});
