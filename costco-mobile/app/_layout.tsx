import { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as Sentry from '@sentry/react-native';
import NetInfo from '@react-native-community/netinfo';
import { PostHogErrorBoundary, PostHogProvider } from 'posthog-react-native';
import { posthog } from '../lib/posthog';
import { useAuth } from '../hooks/useAuth';
import { drainQueue } from '../lib/receiptUpload';

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (sentryDsn && sentryDsn !== 'placeholder') {
  Sentry.init({ dsn: sentryDsn, enabled: !__DEV__ });
}

// Show notifications as banners even when the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const notifListenerRef = useRef<Notifications.EventSubscription | null>(null);
  const responseListenerRef = useRef<Notifications.EventSubscription | null>(null);
  const identifiedUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (loading) return;

    const user = session?.user;
    if (!user) {
      if (identifiedUserIdRef.current !== null) {
        posthog?.reset();
        identifiedUserIdRef.current = null;
      }
      return;
    }

    if (identifiedUserIdRef.current === user.id) return;

    posthog?.identify(
      user.id,
      user.email ? { email: user.email } : undefined,
    );
    identifiedUserIdRef.current = user.id;
  }, [loading, session]);

  // Offline queue drain on reconnect
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) drainQueue();
    });
    return () => unsubscribe();
  }, []);

  // Auth-gated routing
  // (demo) hosts the standalone Warehouse Red & Cream design-system screens —
  // unauthenticated by design, since they render fake data only.
  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    const inDemoGroup = segments[0] === '(demo)';
    if (!session && !inAuthGroup && !inDemoGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments, router]);

  // Notification listeners — set up once after auth is resolved
  useEffect(() => {
    if (loading) return;

    // Foreground notification received (informational — no action needed)
    notifListenerRef.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('Notification received in foreground:', notification.request.identifier);
      },
    );

    // User tapped a notification — route to the relevant screen
    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as Record<string, string> | undefined;
        if (data?.receiptId) {
          router.push(`/receipt-success?receiptId=${data.receiptId}`);
        }
      },
    );

    return () => {
      notifListenerRef.current?.remove();
      responseListenerRef.current?.remove();
    };
  }, [loading, router]);

  const content = (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(demo)" />
      </Stack>
    </SafeAreaProvider>
  );

  return posthog ? (
    <PostHogProvider client={posthog}>
      <PostHogErrorBoundary>{content}</PostHogErrorBoundary>
    </PostHogProvider>
  ) : (
    content
  );
}
