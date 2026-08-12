import { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import NetInfo from '@react-native-community/netinfo';
import { PostHogErrorBoundary, PostHogProvider } from 'posthog-react-native';
import { posthog } from '../lib/posthog';
import { useAuth } from '../hooks/useAuth';
import { drainQueue } from '../lib/receiptUpload';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { ErrorFallback } from '../components/ErrorFallback';

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
  return (
    <ThemeProvider>
      <RootLayoutInner />
    </ThemeProvider>
  );
}

function RootLayoutInner() {
  const { session, loading } = useAuth();
  const { resolvedScheme } = useTheme();
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
  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments, router]);

  // Notification listeners — set up once after auth is resolved
  useEffect(() => {
    if (loading) return;

    // Foreground notification received — no action needed, the badge/list
    // updates reactively from the underlying data the notification refers to.
    notifListenerRef.current = Notifications.addNotificationReceivedListener(() => {});

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
      <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </SafeAreaProvider>
  );

  return posthog ? (
    <PostHogProvider client={posthog}>
      <PostHogErrorBoundary fallback={ErrorFallback}>{content}</PostHogErrorBoundary>
    </PostHogProvider>
  ) : (
    content
  );
}
