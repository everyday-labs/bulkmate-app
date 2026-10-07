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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { posthog } from '../../lib/posthog';
import { useThemeColors } from '../../contexts/ThemeContext';
import type { ColorScheme } from '../../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../../constants/theme';

// Email confirmation is code-based, same as password reset: the "Confirm
// signup" email carries {{ .Token }} and the user types it here. The emailed
// link would redirect to the project's Site URL, and the app has no website.
// verifyOtp signs the user in, and _layout then routes to the tabs.
type Step = 'form' | 'code';

export default function RegisterScreen() {
  const router = useRouter();
  // Login sends an unconfirmed user here with their email to finish verifying.
  const { verifyEmail } = useLocalSearchParams<{ verifyEmail?: string }>();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const [step, setStep] = useState<Step>(verifyEmail ? 'code' : 'form');
  const [email, setEmail] = useState(verifyEmail ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | 'code' | null>(null);

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
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      posthog?.capture('sign_up_failed', { sign_up_method: 'email', error: error.message });
      Alert.alert('Sign up failed', error.message);
      return;
    }
    posthog?.capture('user_registered', { sign_up_method: 'email' });
    // With confirmations off a session comes back immediately and _layout
    // takes over; otherwise the code is on its way.
    if (!data.session) {
      setCode('');
      setStep('code');
    }
  }

  async function verifyCode() {
    if (code.trim().length < 8) {
      Alert.alert('Enter the code', 'Type the 8-digit code from the email.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'signup',
    });
    setLoading(false);
    if (error) {
      posthog?.capture('email_verification_failed', { error: error.message });
      Alert.alert(
        'Code not accepted',
        'That code is invalid or has expired. Request a new one and try again.',
      );
      return;
    }
    posthog?.capture('email_verified');
  }

  async function resendCode() {
    setLoading(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
    setLoading(false);
    if (error) {
      Alert.alert('Could not resend code', error.message);
      return;
    }
    Alert.alert('Code sent', `A new code is on its way to ${email.trim()}.`);
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + spacing['3xl'],
            paddingBottom: insets.bottom + spacing['3xl'],
          },
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
          <Text style={styles.tagline}>Start tracking your savings</Text>
        </View>

        {/* ── Form card ── */}
        {step === 'code' ? (
          <View style={styles.card}>
            <Text style={styles.cardHeading}>Confirm your email</Text>
            <Text style={styles.body}>
              We sent an 8-digit code to <Text style={styles.bodyStrong}>{email.trim()}</Text>.
              Enter it below to finish creating your account.
            </Text>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>CODE</Text>
              <TextInput
                style={[styles.input, styles.codeInput, focused === 'code' && styles.inputFocused]}
                placeholder="12345678"
                placeholderTextColor={Colors.gray[400]}
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
                onFocus={() => setFocused('code')}
                onBlur={() => setFocused(null)}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={8}
                returnKeyType="done"
                onSubmitEditing={verifyCode}
                autoFocus
              />
            </View>

            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
              onPress={verifyCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.primaryBtnText}>Verify Email</Text>
              )}
            </Pressable>

            <Pressable
              onPress={resendCode}
              disabled={loading}
              hitSlop={8}
              style={({ pressed }) => [styles.secondaryLink, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.switchText}>
                Didn&apos;t get it?{'  '}
                <Text style={styles.switchLink}>Resend code</Text>
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setStep('form');
                setCode('');
              }}
              hitSlop={8}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <Text style={styles.switchText}>
                Wrong email?{'  '}
                <Text style={styles.switchLink}>Start over</Text>
              </Text>
            </Pressable>
          </View>
        ) : (
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
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.primaryBtnText}>Create Account</Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => router.back()}
              hitSlop={8}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <Text style={styles.switchText}>
                Already have an account?{'  '}
                <Text style={styles.switchLink}>Sign in</Text>
              </Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.legal}>
          By creating an account you agree to the Everyday Labs Terms of Service and Privacy Policy.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (Colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.background },
    body: {
      fontSize: fontSize.sm,
      color: Colors.gray[500],
      lineHeight: fontSize.sm * 1.5,
      marginBottom: spacing.xl,
    },
    bodyStrong: { color: Colors.gray[900], fontWeight: '700' },
    codeInput: {
      fontSize: fontSize['2xl'],
      letterSpacing: 8,
      textAlign: 'center',
    },
    secondaryLink: { marginBottom: spacing.md },
    scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing['2xl'] },

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

    legal: {
      fontSize: 11,
      color: Colors.gray[400],
      textAlign: 'center',
      lineHeight: 16,
      paddingHorizontal: spacing.sm,
    },
  });
