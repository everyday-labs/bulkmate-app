import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const PROMPTED_KEY = 'push_permission_prompted';

export async function hasPromptedForPushPermission(): Promise<boolean> {
  const val = await AsyncStorage.getItem(PROMPTED_KEY);
  return val === 'true';
}

export async function markPushPermissionPrompted(): Promise<void> {
  await AsyncStorage.setItem(PROMPTED_KEY, 'true');
}

// Call after the user taps "Allow" on our in-app prompt.
// Triggers the OS permission dialog, then saves the token to profiles.
export async function requestAndSavePushToken(): Promise<'granted' | 'denied'> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return 'denied';

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync();
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase
        .from('profiles')
        .update({ push_token: token })
        .eq('id', session.user.id);
    }
  } catch {
    // Token fetch can fail on simulators — not a hard error
  }

  return 'granted';
}
