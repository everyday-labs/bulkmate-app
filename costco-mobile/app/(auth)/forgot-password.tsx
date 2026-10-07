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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { posthog } from '../../lib/posthog';
import { useThemeColors } from '../../contexts/ThemeContext';
import type { ColorScheme } from '../../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../../constants/theme';

// Code-based recovery (not a magic link) so it works without deep-link setup.
// Requires the Supabase "Reset Password" email template to include {{ .Token }}.
// verifyOtp signs the user in, so _layout.tsx exempts this screen from the
// "signed in → leave (auth)" redirect until the new password is saved.
type Step = 'email' | 'code' | 'password';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  async function sendCode() {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert('Missing email', 'Please enter the email you signed up with.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed);
    setLoading(false);
    if (error) {
      posthog?.capture('password_reset_failed', { stage: 'send_code', error: error.message });
      Alert.alert('Could not send code', error.message);
      return;
    }
    posthog?.capture('password_reset_requested');
    setCode('');
    setStep('code');
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
      type: 'recovery',
    });
    setLoading(false);
    if (error) {
      posthog?.capture('password_reset_failed', { stage: 'verify_code', error: error.message });
      Alert.alert(
        'Code not accepted',
        'That code is invalid or has expired. Request a new one and try again.',
      );
      return;
    }
    setStep('password');
  }

  async function savePassword() {
    if (password.length < 8) {
      Alert.alert('Password too short', 'Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Passwords don’t match', 'Please re-enter the same password in both fields.');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      posthog?.capture('password_reset_failed', { stage: 'update_password', error: error.message });
      Alert.alert('Could not update password', error.message);
      return;
    }
    posthog?.identify(data.user.id, data.user.email ? { email: data.user.email } : undefined);
    posthog?.capture('password_reset_completed');
    router.replace('/(tabs)');
  }

  const heading = { email: 'Reset password', code: 'Check your email', password: 'New password' }[
    step
  ];
  const action = { email: sendCode, code: verifyCode, password: savePassword }[step];
  const actionLabel = { email: 'Send Code', code: 'Verify Code', password: 'Save Password' }[step];

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
        <View style={styles.card}>
          <Text style={styles.cardHeading}>{heading}</Text>

          {step === 'email' && (
            <>
              <Text style={styles.body}>
                Enter the email for your account and we&apos;ll send you an 8-digit code.
              </Text>
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
                  returnKeyType="send"
                  onSubmitEditing={sendCode}
                  autoFocus
                />
              </View>
            </>
          )}

          {step === 'code' && (
            <>
              <Text style={styles.body}>
                If an account exists for <Text style={styles.bodyStrong}>{email.trim()}</Text>, an
                8-digit code is on its way. It expires in 1 hour.
              </Text>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>CODE</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.codeInput,
                    focused === 'code' && styles.inputFocused,
                  ]}
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
            </>
          )}

          {step === 'password' && (
            <>
              <Text style={styles.body}>Choose a new password for your account.</Text>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>NEW PASSWORD</Text>
                <TextInput
                  style={[styles.input, focused === 'password' && styles.inputFocused]}
                  placeholder="Min. 8 characters"
                  placeholderTextColor={Colors.gray[400]}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  secureTextEntry
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="next"
                  autoFocus
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>CONFIRM PASSWORD</Text>
                <TextInput
                  style={[styles.input, focused === 'confirm' && styles.inputFocused]}
                  placeholder="Re-enter password"
                  placeholderTextColor={Colors.gray[400]}
                  value={confirm}
                  onChangeText={setConfirm}
                  onFocus={() => setFocused('confirm')}
                  onBlur={() => setFocused(null)}
                  secureTextEntry
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={savePassword}
                />
              </View>
            </>
          )}

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
            onPress={action}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.primaryBtnText}>{actionLabel}</Text>
            )}
          </Pressable>

          {step === 'code' && (
            <Pressable
              onPress={sendCode}
              disabled={loading}
              hitSlop={8}
              style={({ pressed }) => [styles.secondaryLink, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.switchText}>
                Didn&apos;t get it?{'  '}
                <Text style={styles.switchLink}>Resend code</Text>
              </Text>
            </Pressable>
          )}

          {step !== 'password' && (
            <Pressable
              onPress={() => router.back()}
              hitSlop={8}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <Text style={styles.switchText}>
                Remembered it?{'  '}
                <Text style={styles.switchLink}>Back to sign in</Text>
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (Colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.background },
    scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing['2xl'] },

    // Card
    card: {
      backgroundColor: Colors.surface,
      borderRadius: radius['3xl'],
      padding: spacing['2xl'],
      ...shadow.md,
    },
    cardHeading: {
      fontSize: fontSize['3xl'],
      fontWeight: '700',
      color: Colors.gray[900],
      marginBottom: spacing.md,
      letterSpacing: letterSpacing.tight,
    },
    body: {
      fontSize: fontSize.sm,
      color: Colors.gray[500],
      lineHeight: fontSize.sm * 1.5,
      marginBottom: spacing.xl,
    },
    bodyStrong: { color: Colors.gray[900], fontWeight: '700' },

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
    codeInput: {
      fontSize: fontSize['2xl'],
      letterSpacing: 8,
      textAlign: 'center',
    },

    // Buttons
    primaryBtn: {
      backgroundColor: Colors.costcoRedSolid,
      borderRadius: radius.lg,
      paddingVertical: spacing.lg,
      alignItems: 'center',
      marginTop: spacing.md,
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
    secondaryLink: { marginBottom: spacing.md },
    switchText: { textAlign: 'center', fontSize: fontSize.sm, color: Colors.gray[500] },
    switchLink: { color: Colors.executiveNavy, fontWeight: '700' },
  });
