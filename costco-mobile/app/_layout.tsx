import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as Sentry from '@sentry/react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../hooks/useAuth';
import { drainQueue } from '../lib/receiptUpload';

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (sentryDsn && sentryDsn !== 'placeholder') {
  Sentry.init({ dsn: sentryDsn, enabled: !__DEV__ });
}

export default function RootLayout() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) drainQueue();
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
