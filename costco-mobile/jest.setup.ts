// Global test setup: replaces native modules and network clients with
// in-memory fakes so screens can render in Node. Per-test data goes through
// test-utils/supabaseMock.ts and test-utils/routerMock.tsx.
import { act, configure } from '@testing-library/react-native';
import { resetSupabaseMock } from './test-utils/supabaseMock';
import { resetRouterMock } from './test-utils/routerMock';

// waitFor/findBy wait up to 5s (default 1s): CI runners are much slower than
// a laptop, and debounced/timed UI (search, prompts) needs the headroom.
configure({ asyncUtilTimeout: 5000 });

process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('expo-router', () => require('./test-utils/routerMock').expoRouterMock);
jest.mock('./lib/supabase', () => ({
  supabase: require('./test-utils/supabaseMock').supabaseMock,
}));
jest.mock('./lib/posthog', () => ({
  posthog: {
    capture: jest.fn(),
    identify: jest.fn(),
    reset: jest.fn(),
    screen: jest.fn(),
    captureException: jest.fn(),
  },
}));

jest.mock('expo-camera', () => {
  const { View } = require('react-native');
  return {
    CameraView: jest.fn((props: object) =>
      require('react').createElement(View, { ...props, testID: 'camera-view' }),
    ),
    useCameraPermissions: jest.fn(() => [{ granted: true, canAskAgain: true }, jest.fn()]),
  };
});
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(() =>
    Promise.resolve({ coords: { latitude: 37.25, longitude: -121.86, accuracy: 10 } }),
  ),
  Accuracy: { High: 4, Balanced: 3 },
}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'undetermined' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: 'ExponentPushToken[test]' })),
  setNotificationChannelAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
  AndroidImportance: { HIGH: 4 },
}));
jest.mock('expo-apple-authentication', () => {
  const { View } = require('react-native');
  return {
    isAvailableAsync: jest.fn(() => Promise.resolve(true)),
    signInAsync: jest.fn(() => Promise.resolve({ identityToken: 'apple-token', fullName: null })),
    AppleAuthenticationButton: jest.fn((props: { onPress: () => void }) =>
      require('react').createElement(View, { testID: 'apple-sign-in', onPress: props.onPress }),
    ),
    AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1 },
    AppleAuthenticationButtonStyle: { BLACK: 0, WHITE: 1 },
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  };
});
jest.mock('expo-file-system/next', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({
    uri,
    bytes: jest.fn(() => Promise.resolve(new Uint8Array([1, 2, 3]))),
    exists: true,
    delete: jest.fn(),
    copy: jest.fn(),
  })),
  Paths: { cache: { uri: 'file:///cache/' }, document: { uri: 'file:///docs/' } },
}));

beforeEach(() => {
  resetSupabaseMock();
  resetRouterMock();
});

// Let async work a test kicked off (a trailing setLoading(false), etc.)
// settle inside act, so it can't leak into the next test or warn.
afterEach(async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
});
