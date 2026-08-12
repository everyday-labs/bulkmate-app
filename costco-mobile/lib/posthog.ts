import Constants from 'expo-constants';
import PostHog from 'posthog-react-native';

type PostHogExtra = {
  posthogProjectToken?: string;
  posthogHost?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as PostHogExtra;
const projectToken = extra.posthogProjectToken;
const host = extra.posthogHost;

if (__DEV__ && !projectToken) {
  throw new Error(
    'POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_PROJECT_TOKEN is configured',
  );
}

if (__DEV__ && !host) {
  throw new Error(
    'POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_HOST is configured',
  );
}

export const posthog = projectToken && host
  ? new PostHog(projectToken, {
      host,
      // PostHog is the sole error tracker (Sentry was removed) — capture
      // uncaught JS exceptions, unhandled promise rejections, and
      // console.error calls automatically, in addition to the React render
      // errors PostHogErrorBoundary already catches in _layout.tsx.
      errorTracking: {
        autocapture: {
          uncaughtExceptions: true,
          unhandledRejections: true,
          console: ['error'],
        },
      },
      // Session replay for understanding user journeys end-to-end. Masked
      // by default — receipts show real prices and personal purchase data,
      // so recordings must never capture typed input or on-screen images.
      enableSessionReplay: true,
      sessionReplayConfig: {
        maskAllTextInputs: true,
        maskAllImages: true,
      },
    })
  : null;
