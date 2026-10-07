const appJson = require('./app.json');

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
