// Native Google Sign-In → Google ID token → supabase.auth.signInWithIdToken.
//
// The native module is required lazily: it throws at import time when it isn't
// compiled into the binary (Expo Go, or a build made before it was added), and
// a top-level import would take the whole login screen down with it. In that
// case — or when the client IDs aren't configured — `googleSignInAvailable` is
// false and the login screen simply hides the Google button.
import type * as GoogleSignInModule from '@react-native-google-signin/google-signin';

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

let mod: typeof GoogleSignInModule | null = null;
if (webClientId && iosClientId) {
  try {
    mod = require('@react-native-google-signin/google-signin');
    // webClientId makes Google mint the ID token for the *web* client, which is
    // the audience Supabase's Google provider validates against.
    mod!.GoogleSignin.configure({ webClientId, iosClientId });
  } catch {
    mod = null;
  }
}

export const googleSignInAvailable = mod !== null;

/** Resolves to a Google ID token, or null if the user cancelled. Throws on real failures. */
export async function getGoogleIdToken(): Promise<string | null> {
  if (!mod) throw new Error('Google Sign-In is not available in this build.');
  const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = mod;
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null;
    if (!response.data.idToken) throw new Error('Google did not return an ID token.');
    return response.data.idToken;
  } catch (e) {
    // A second tap while the sheet is already open isn't a failure.
    if (isErrorWithCode(e) && e.code === statusCodes.IN_PROGRESS) return null;
    throw e;
  }
}

/** Clears the cached Google account so the next sign-in shows the account picker again. */
export async function signOutOfGoogle(): Promise<void> {
  try {
    await mod?.GoogleSignin.signOut();
  } catch {
    // Not signed in to Google, or module unavailable — nothing to clear.
  }
}
