import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { requestAndSavePushToken } from '../../lib/notifications';
import { Colors } from '../../constants/colors';

type PermissionStatus = 'granted' | 'denied' | 'undetermined' | 'loading';

export default function ProfileScreen() {
  const { session } = useAuth();
  const [permStatus, setPermStatus] = useState<PermissionStatus>('loading');
  const [enablingNotifs, setEnablingNotifs] = useState(false);

  // Re-check permission every time screen is focused — catches the case where
  // the user went to iOS Settings and manually enabled/disabled notifications.
  useFocusEffect(
    useCallback(() => {
      Notifications.getPermissionsAsync().then(({ status }) => {
        setPermStatus(status as PermissionStatus);
      });
    }, []),
  );

  async function handleEnableNotifications() {
    setEnablingNotifs(true);
    try {
      const result = await requestAndSavePushToken();
      setPermStatus(result === 'granted' ? 'granted' : 'denied');
    } finally {
      setEnablingNotifs(false);
    }
  }

  const email = session?.user.email ?? '';
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <View style={styles.container}>
      {/* Avatar + email */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.email}>{email}</Text>
      </View>

      {/* Settings rows */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Settings</Text>

        <View style={styles.card}>
          <NotificationsRow
            status={permStatus}
            loading={enablingNotifs}
            onEnable={handleEnableNotifications}
            onOpenSettings={() => Linking.openSettings()}
          />

          <View style={styles.rowDivider} />

          <TouchableOpacity
            style={styles.row}
            onPress={() => supabase.auth.signOut()}
            activeOpacity={0.7}
          >
            <Text style={styles.rowLabel}>Sign Out</Text>
            <Text style={[styles.rowValue, { color: Colors.costcoRed }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function NotificationsRow({
  status,
  loading,
  onEnable,
  onOpenSettings,
}: {
  status: PermissionStatus;
  loading: boolean;
  onEnable: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowLabel}>Price Alert Notifications</Text>
        <Text style={styles.rowSubtitle}>
          {status === 'granted'
            ? 'You\'ll be notified when a price drops on a recent purchase'
            : 'Get notified when you may be owed a refund'}
        </Text>
      </View>

      {status === 'loading' && <ActivityIndicator size="small" color={Colors.gray[500]} />}

      {status === 'granted' && (
        <View style={styles.enabledBadge}>
          <Text style={styles.enabledText}>On</Text>
        </View>
      )}

      {status === 'undetermined' && (
        <TouchableOpacity
          style={styles.enableButton}
          onPress={onEnable}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator size="small" color={Colors.white} />
            : <Text style={styles.enableButtonText}>Enable</Text>
          }
        </TouchableOpacity>
      )}

      {status === 'denied' && (
        <TouchableOpacity style={styles.settingsButton} onPress={onOpenSettings}>
          <Text style={styles.settingsButtonText}>Settings</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[100],
  },

  // Avatar
  avatarSection: {
    alignItems: 'center',
    paddingTop: 72,
    paddingBottom: 32,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.executiveNavy,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: Colors.white,
    fontSize: 26,
    fontWeight: '700',
  },
  email: {
    fontSize: 15,
    color: Colors.gray[500],
  },

  // Sections
  section: {
    marginTop: 28,
    paddingHorizontal: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.gray[500],
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    paddingLeft: 4,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    overflow: 'hidden',
  },

  // Rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  rowLeft: {
    flex: 1,
    paddingRight: 12,
  },
  rowLabel: {
    fontSize: 15,
    color: Colors.gray[700],
    fontWeight: '500',
  },
  rowSubtitle: {
    fontSize: 12,
    color: Colors.gray[500],
    marginTop: 2,
    lineHeight: 16,
  },
  rowValue: {
    fontSize: 15,
    color: Colors.gray[500],
  },
  rowDivider: {
    height: 1,
    backgroundColor: Colors.gray[100],
    marginLeft: 16,
  },

  // Notification states
  enabledBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  enabledText: {
    color: '#15803D',
    fontSize: 13,
    fontWeight: '700',
  },
  enableButton: {
    backgroundColor: Colors.costcoRed,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 72,
    alignItems: 'center',
  },
  enableButtonText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  settingsButton: {
    borderWidth: 1,
    borderColor: Colors.gray[300],
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  settingsButtonText: {
    color: Colors.gray[700],
    fontSize: 13,
    fontWeight: '600',
  },
});
