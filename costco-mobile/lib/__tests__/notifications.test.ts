import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  hasPromptedForPushPermission,
  markPushPermissionPrompted,
  requestAndSavePushToken,
} from '../notifications';
import { lastQuery, signedOut } from '../../test-utils/supabaseMock';

const N = Notifications as jest.Mocked<typeof Notifications>;

describe('push permission prompt flag', () => {
  beforeEach(() => AsyncStorage.clear());

  it('is remembered once set', async () => {
    expect(await hasPromptedForPushPermission()).toBe(false);
    await markPushPermissionPrompted();
    expect(await hasPromptedForPushPermission()).toBe(true);
  });
});

describe('requestAndSavePushToken', () => {
  it('asks for permission and saves the token on the profile', async () => {
    expect(await requestAndSavePushToken()).toBe('granted');
    expect(N.requestPermissionsAsync).toHaveBeenCalled();
    const q = lastQuery('profiles');
    expect(q?.payload).toEqual({ push_token: 'ExponentPushToken[test]' });
    expect(q?.filters).toContainEqual(['eq', 'id', 'user-1']);
  });

  it('does not re-prompt when already granted', async () => {
    N.getPermissionsAsync.mockResolvedValueOnce({ status: 'granted' } as never);
    expect(await requestAndSavePushToken()).toBe('granted');
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('returns denied without touching the profile', async () => {
    N.requestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' } as never);
    expect(await requestAndSavePushToken()).toBe('denied');
    expect(lastQuery('profiles')).toBeUndefined();
  });

  it('skips saving when signed out, and tolerates token errors', async () => {
    signedOut();
    expect(await requestAndSavePushToken()).toBe('granted');
    expect(lastQuery('profiles')).toBeUndefined();

    N.getExpoPushTokenAsync.mockRejectedValueOnce(new Error('simulator'));
    expect(await requestAndSavePushToken()).toBe('granted');
  });

  it('creates the Android channel', async () => {
    const os = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      await requestAndSavePushToken();
      expect(N.setNotificationChannelAsync).toHaveBeenCalledWith(
        'price-alerts',
        expect.any(Object),
      );
    } finally {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
    }
  });
});
