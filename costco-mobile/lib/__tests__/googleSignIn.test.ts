// googleSignIn reads its client IDs and requires the native module at import
// time, so each test loads a fresh copy with jest.isolateModules.

const IN_PROGRESS = 'IN_PROGRESS';

function mockNativeModule(signIn: jest.Mock) {
  const GoogleSignin = {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn,
    signOut: jest.fn().mockResolvedValue(undefined),
  };
  jest.doMock('@react-native-google-signin/google-signin', () => ({
    GoogleSignin,
    isSuccessResponse: (r: { type: string }) => r.type === 'success',
    isErrorWithCode: (e: unknown) => typeof e === 'object' && e !== null && 'code' in e,
    statusCodes: { IN_PROGRESS },
  }));
  return GoogleSignin;
}

function load(): typeof import('../googleSignIn') {
  let mod!: typeof import('../googleSignIn');
  jest.isolateModules(() => {
    mod = require('../googleSignIn');
  });
  return mod;
}

const ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...ENV };
});

afterAll(() => {
  process.env = ENV;
});

describe('without client IDs (e.g. Expo Go)', () => {
  it('reports unavailable and refuses to sign in', async () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    const { googleSignInAvailable, getGoogleIdToken, signOutOfGoogle } = load();
    expect(googleSignInAvailable).toBe(false);
    await expect(getGoogleIdToken()).rejects.toThrow('not available');
    await expect(signOutOfGoogle()).resolves.toBeUndefined();
  });
});

describe('with client IDs configured', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web-client';
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = 'ios-client';
  });

  it('configures the native module with both client IDs', () => {
    const native = mockNativeModule(jest.fn());
    expect(load().googleSignInAvailable).toBe(true);
    expect(native.configure).toHaveBeenCalledWith({
      webClientId: 'web-client',
      iosClientId: 'ios-client',
    });
  });

  it('returns the ID token on success', async () => {
    mockNativeModule(
      jest.fn().mockResolvedValue({ type: 'success', data: { idToken: 'id-token' } }),
    );
    await expect(load().getGoogleIdToken()).resolves.toBe('id-token');
  });

  it('returns null when the user cancels', async () => {
    mockNativeModule(jest.fn().mockResolvedValue({ type: 'cancelled', data: null }));
    await expect(load().getGoogleIdToken()).resolves.toBeNull();
  });

  it('returns null for a second tap while the sheet is open', async () => {
    mockNativeModule(jest.fn().mockRejectedValue({ code: IN_PROGRESS }));
    await expect(load().getGoogleIdToken()).resolves.toBeNull();
  });

  it('throws when Google returns no ID token', async () => {
    mockNativeModule(jest.fn().mockResolvedValue({ type: 'success', data: { idToken: null } }));
    await expect(load().getGoogleIdToken()).rejects.toThrow('did not return an ID token');
  });

  it('rethrows real failures', async () => {
    mockNativeModule(jest.fn().mockRejectedValue(new Error('network')));
    await expect(load().getGoogleIdToken()).rejects.toThrow('network');
  });

  it('reports unavailable when the native module is missing from the build', () => {
    jest.doMock('@react-native-google-signin/google-signin', () => {
      throw new Error('native module not found');
    });
    expect(load().googleSignInAvailable).toBe(false);
  });
});
