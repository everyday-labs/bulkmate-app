import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { posthog } from '../lib/posthog';
import { useAuth } from '../hooks/useAuth';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ColorScheme } from '../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../constants/theme';

// Opt-in for weekly price-drop texts. The number must be verified by an SMS
// code (phone-verification Edge Function) before texts can be switched on —
// the server also refuses to enable texts for an unverified number.
type Step = 'phone' | 'code';

async function callPhoneVerification(body: Record<string, string>): Promise<{ error?: string }> {
  const { error } = await supabase.functions.invoke('phone-verification', { body });
  if (!error) return {};
  if (error instanceof FunctionsHttpError) {
    const payload = await error.context.json().catch(() => null);
    if (payload?.error) return { error: payload.error };
  }
  return { error: 'Something went wrong. Please try again.' };
}

export default function VerifyPhoneScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const Colors = useThemeColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('+1 ');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<Step | null>(null);

  // Pre-fill with the number already on the profile, if any.
  useEffect(() => {
    if (!session?.user.id) return;
    supabase
      .from('profiles')
      .select('phone_number')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => { if (data?.phone_number) setPhone(data.phone_number); });
  }, [session?.user.id]);

  async function sendCode() {
    setLoading(true);
    const { error } = await callPhoneVerification({ action: 'send', phone });
    setLoading(false);
    if (error) {
      posthog?.capture('phone_verification_failed', { stage: 'send', error });
      Alert.alert('Could not send code', error);
      return;
    }
    posthog?.capture('phone_verification_code_sent');
    setCode('');
    setStep('code');
  }

  async function verifyCode() {
    if (code.trim().length < 6) {
      Alert.alert('Enter the code', 'Type the 6-digit code from the text message.');
      return;
    }
    setLoading(true);
    const { error } = await callPhoneVerification({ action: 'verify', code: code.trim() });
    setLoading(false);
    if (error) {
      posthog?.capture('phone_verification_failed', { stage: 'verify', error });
      Alert.alert('Code not accepted', error);
      return;
    }
    posthog?.capture('sms_alerts_enabled');
    Alert.alert('Weekly texts are on', 'You’ll get a summary of price drops every Friday afternoon.');
    router.back();
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => [styles.headerBack, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.headerBackText}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Weekly Texts</Text>
        <View style={styles.headerBack} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing['2xl'] }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          {step === 'phone' ? (
            <>
              <Text style={styles.body}>
                Get one text every Friday afternoon with the price drops on things you bought —
                and how much you could get back.
              </Text>
              <View style={styles.field}>
                <Text style={styles.label}>MOBILE NUMBER</Text>
                <TextInput
                  style={[styles.input, focused === 'phone' && styles.inputFocused]}
                  value={phone}
                  onChangeText={setPhone}
                  onFocus={() => setFocused('phone')}
                  onBlur={() => setFocused(null)}
                  placeholder="+1 555 123 4567"
                  placeholderTextColor={Colors.gray[400]}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                  returnKeyType="send"
                  onSubmitEditing={sendCode}
                  autoFocus
                />
                <Text style={styles.hint}>Include your country code (+1 for the US and Canada).</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.body}>
                We texted a 6-digit code to <Text style={styles.bodyStrong}>{phone}</Text>. It expires in 10 minutes.
              </Text>
              <View style={styles.field}>
                <Text style={styles.label}>CODE</Text>
                <TextInput
                  style={[styles.input, styles.codeInput, focused === 'code' && styles.inputFocused]}
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
                  onFocus={() => setFocused('code')}
                  onBlur={() => setFocused(null)}
                  placeholder="123456"
                  placeholderTextColor={Colors.gray[400]}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  maxLength={6}
                  returnKeyType="done"
                  onSubmitEditing={verifyCode}
                  autoFocus
                />
              </View>
            </>
          )}

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
            onPress={step === 'phone' ? sendCode : verifyCode}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={Colors.white} />
              : <Text style={styles.primaryBtnText}>{step === 'phone' ? 'Send Code' : 'Verify & Turn On'}</Text>}
          </Pressable>

          {step === 'code' && (
            <Pressable onPress={() => setStep('phone')} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.6 }}>
              <Text style={styles.switchText}>
                Wrong number or no text?{'  '}<Text style={styles.switchLink}>Try again</Text>
              </Text>
            </Pressable>
          )}
        </View>

        {/* Consent disclosure — required for recurring automated texts. */}
        <Text style={styles.legal}>
          By turning on weekly texts, you agree to receive one automated text message per week from
          Bulkmate (Everyday Labs) about price drops on your purchases. Message and data rates may
          apply. Reply STOP to cancel at any time, or turn texts off in Profile → Preferences.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (Colors: ColorScheme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerBack:     { minWidth: 60 },
  headerBackText: { fontSize: fontSize.md, color: Colors.gray[500], fontWeight: '500' },
  headerTitle:    { fontSize: fontSize.lg, fontWeight: '700', color: Colors.gray[900] },

  scroll: { padding: spacing['2xl'], gap: spacing.lg },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: radius['2xl'],
    padding: spacing.xl,
    ...shadow.sm,
  },
  body: {
    fontSize: fontSize.sm,
    color: Colors.gray[500],
    lineHeight: fontSize.sm * 1.5,
    marginBottom: spacing.xl,
  },
  bodyStrong: { color: Colors.gray[900], fontWeight: '700' },

  field: { gap: spacing.xs, marginBottom: spacing.lg },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: Colors.gray[400],
    letterSpacing: letterSpacing.caps,
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
  inputFocused: { backgroundColor: Colors.surface, borderColor: Colors.executiveNavy },
  codeInput: { fontSize: fontSize['2xl'], letterSpacing: 8, textAlign: 'center' },
  hint: { fontSize: fontSize.xs, color: Colors.gray[400] },

  primaryBtn: {
    backgroundColor: Colors.costcoRedSolid,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...shadow.sm,
  },
  primaryBtnPressed: { backgroundColor: Colors.costcoRedDark, opacity: 0.95 },
  primaryBtnText: { color: Colors.white, fontSize: fontSize.lg, fontWeight: '700', letterSpacing: letterSpacing.wide },

  switchText: { textAlign: 'center', fontSize: fontSize.sm, color: Colors.gray[500] },
  switchLink: { color: Colors.executiveNavy, fontWeight: '700' },

  legal: { fontSize: fontSize.xs, color: Colors.gray[400], lineHeight: fontSize.xs * 1.6, textAlign: 'center' },
});
