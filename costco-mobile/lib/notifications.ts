import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const PROMPTED_KEY = 'push_permission_prompted';
// Must match the EAS projectId in app.json
const EAS_PROJECT_ID = '92f28e61-30ad-4180-aa20-32e6fc88c52c';

export async function hasPromptedForPushPermission(): Promise<boolean> {
  const val = await AsyncStorage.getItem(PROMPTED_KEY);
  return val === 'true';
}

export async function markPushPermissionPrompted(): Promise<void> {
  await AsyncStorage.setItem(PROMPTED_KEY, 'true');
}

export async function requestAndSavePushToken(): Promise<'granted' | 'denied'> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return 'denied';

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('price-alerts', {
      name: 'Price Alerts',
      description: 'Notified when a price drops on something you bought',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#E31837',
    });
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: EAS_PROJECT_ID,
    });
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      await supabase.from('profiles').update({ push_token: token }).eq('id', session.user.id);
    }
  } catch {
    // Token fetch fails on simulators — not a hard error
  }

  return 'granted';
}
