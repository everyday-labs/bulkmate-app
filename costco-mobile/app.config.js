const appJson = require('./app.json');

// EAS production builds bake these values into the app. Build 4 (2026-10-08) shipped with
// stray text after the anon key and no Google client IDs: every Supabase call got a 401
// ("nothing happens" on sign-up) and the Google button vanished. Fail the build instead.
if (process.env.EAS_BUILD && process.env.EAS_BUILD_PROFILE === 'production') {
  const problems = [];
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const jwt = key.split('.');
  // Legacy anon key: an HS256 JWT, whose signature is always 43 characters.
  const wellFormed =
    key.startsWith('sb_publishable_') || (jwt.length === 3 && jwt[2].length === 43);
  if (!wellFormed) problems.push('EXPO_PUBLIC_SUPABASE_ANON_KEY is not a well-formed anon key');
  for (const name of [
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
    'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  ]) {
    if (!process.env[name]) problems.push(`${name} is not set`);
  }
  if (problems.length) {
    throw new Error(
      `Production build config:\n- ${problems.join('\n- ')}\n` +
        'Fix with `eas env:update` / `eas env:create --environment production`.',
    );
  }
}

// Google Sign-In's iOS callback scheme is the iOS OAuth client ID reversed.
// The plugin is only added once the client ID is configured — it hard-fails
// prebuild without one.
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const googlePlugins = googleIosClientId
  ? [
      [
        '@react-native-google-signin/google-signin',
        {
          iosUrlScheme: `com.googleusercontent.apps.${googleIosClientId.replace('.apps.googleusercontent.com', '')}`,
        },
      ],
    ]
  : [];

module.exports = {
  ...appJson,
  expo: {
    ...appJson.expo,
    plugins: [...appJson.expo.plugins, ...googlePlugins],
    extra: {
      ...appJson.expo.extra,
      posthogProjectToken: process.env.POSTHOG_PROJECT_TOKEN,
      posthogHost: process.env.POSTHOG_HOST,
    },
  },
};
