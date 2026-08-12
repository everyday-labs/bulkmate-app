import { useEffect, useMemo, useRef, useState } from 'react';
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
import { supabase } from '../lib/supabase';
import { posthog } from '../lib/posthog';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ColorScheme } from '../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../constants/theme';

type Field = 'first' | 'last' | 'phone';

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [phone, setPhone]         = useState('');
  const [focused, setFocused]     = useState<Field | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);

  const lastRef  = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);

  useEffect(() => {
    async function fetch() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name, phone_number')
        .eq('id', session.user.id)
        .single();
      if (data) {
        setFirstName(data.first_name ?? '');
        setLastName(data.last_name  ?? '');
        setPhone(data.phone_number  ?? '');
      }
      setLoading(false);
    }
    fetch();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase
        .from('profiles')
        .update({
          first_name:   firstName.trim() || null,
          last_name:    lastName.trim()  || null,
          phone_number: phone.trim()     || null,
          display_name: [firstName.trim(), lastName.trim()].filter(Boolean).join(' ') || null,
        })
        .eq('id', session.user.id);

      if (error) throw error;
      posthog?.capture('profile_updated');
      router.back();
    } catch (e: any) {
      Alert.alert('Save failed', e.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.costcoRed} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => [styles.headerBack, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.headerBackText}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <Pressable
          onPress={save}
          disabled={saving}
          hitSlop={8}
          style={({ pressed }) => [styles.headerSave, pressed && !saving && { opacity: 0.6 }]}
        >
          {saving
            ? <ActivityIndicator size="small" color={Colors.costcoRed} />
            : <Text style={styles.headerSaveText}>Save</Text>
          }
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing['4xl'] }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Name card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>YOUR NAME</Text>

          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.label}>FIRST NAME</Text>
              <TextInput
                style={[styles.input, focused === 'first' && styles.inputFocused]}
                placeholder="First"
                placeholderTextColor={Colors.gray[300]}
                value={firstName}
                onChangeText={setFirstName}
                onFocus={() => setFocused('first')}
                onBlur={() => setFocused(null)}
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => lastRef.current?.focus()}
              />
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.label}>LAST NAME</Text>
              <TextInput
                ref={lastRef}
                style={[styles.input, focused === 'last' && styles.inputFocused]}
                placeholder="Last"
                placeholderTextColor={Colors.gray[300]}
                value={lastName}
                onChangeText={setLastName}
                onFocus={() => setFocused('last')}
                onBlur={() => setFocused(null)}
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => phoneRef.current?.focus()}
              />
            </View>
          </View>
        </View>

        {/* Phone card */}
        <View style={styles.card}>
          <View style={styles.phoneTitleRow}>
            <Text style={styles.cardTitle}>PHONE NUMBER</Text>
            <View style={styles.optionalBadge}>
              <Text style={styles.optionalText}>OPTIONAL</Text>
            </View>
          </View>

          <View style={styles.field}>
            <TextInput
              ref={phoneRef}
              style={[styles.input, focused === 'phone' && styles.inputFocused]}
              placeholder="+1 (555) 123-4567"
              placeholderTextColor={Colors.gray[300]}
              value={phone}
              onChangeText={setPhone}
              onFocus={() => setFocused('phone')}
              onBlur={() => setFocused(null)}
              keyboardType="phone-pad"
              returnKeyType="done"
              onSubmitEditing={save}
            />
          </View>

          <View style={styles.phoneNote}>
            <Text style={styles.phoneNoteIcon}>🔒</Text>
            <Text style={styles.phoneNoteText}>
              We'll only text you when a price-match refund is available on something you bought.
              We never share your number with anyone.
            </Text>
          </View>
        </View>

        {/* Save button (also accessible from header but surfaced here for convenience) */}
        <Pressable
          style={({ pressed }) => [styles.saveBtn, pressed && styles.saveBtnPressed, saving && { opacity: 0.6 }]}
          onPress={save}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color={Colors.white} />
            : <Text style={styles.saveBtnText}>Save Changes</Text>
          }
        </Pressable>

        <Text style={styles.privacyNote}>
          Your information is stored securely and only used to personalise your experience in this app.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (Colors: ColorScheme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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
  headerSave:     { minWidth: 60, alignItems: 'flex-end' },
  headerSaveText: { fontSize: fontSize.md, color: Colors.costcoRed, fontWeight: '700' },

  scroll: { padding: spacing['2xl'], gap: spacing.lg },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: radius['2xl'],
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadow.sm,
  },
  cardTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: Colors.gray[400],
    letterSpacing: letterSpacing.caps,
  },

  row: { flexDirection: 'row', gap: spacing.md },

  field: { gap: spacing.xs },
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
  inputFocused: {
    backgroundColor: Colors.surface,
    borderColor: Colors.executiveNavy,
  },

  phoneTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  optionalBadge: {
    backgroundColor: Colors.goldStarSubtle,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  optionalText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.goldStarAccent,
    letterSpacing: letterSpacing.caps,
  },

  phoneNote: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: Colors.executiveNavySubtle,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'flex-start',
  },
  phoneNoteIcon: { fontSize: 14, marginTop: 1 },
  phoneNoteText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: Colors.executiveNavy,
    lineHeight: 17,
    fontWeight: '500',
  },

  saveBtn: {
    backgroundColor: Colors.costcoRedSolid,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    ...shadow.sm,
  },
  saveBtnPressed: { backgroundColor: Colors.costcoRedDark },
  saveBtnText: {
    color: Colors.white,
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: letterSpacing.wide,
  },

  privacyNote: {
    fontSize: fontSize.xs,
    color: Colors.gray[400],
    textAlign: 'center',
    lineHeight: 18,
  },
});
