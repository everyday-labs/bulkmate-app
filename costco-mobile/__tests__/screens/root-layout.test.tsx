import { act, render, waitFor } from '@testing-library/react-native';
import NetInfo from '@react-native-community/netinfo';
import * as Notifications from 'expo-notifications';
import RootLayout from '../../app/_layout';
import { signOutOfGoogle } from '../../lib/googleSignIn';
import { posthog } from '../../lib/posthog';
import { drainQueue } from '../../lib/receiptUpload';
import { router, setSegments } from '../../test-utils/routerMock';
import { emitAuthChange, signedOut, TEST_SESSION, TEST_USER } from '../../test-utils/supabaseMock';

jest.mock('posthog-react-native', () => ({
  PostHogProvider: ({ children }: { children: React.ReactNode }) => children,
  PostHogErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../lib/googleSignIn', () => ({ signOutOfGoogle: jest.fn() }));
jest.mock('../../lib/receiptUpload', () => ({ drainQueue: jest.fn() }));

const N = Notifications as jest.Mocked<typeof Notifications>;

async function renderLayout() {
  const result = render(<RootLayout />);
  await waitFor(() => expect(N.addNotificationResponseReceivedListener).toHaveBeenCalled());
  return result;
}

describe('RootLayout auth gate', () => {
  it('sends a signed-out user to login', async () => {
    signedOut();
    setSegments(['(tabs)']);
    await renderLayout();
    expect(router.replace).toHaveBeenCalledWith('/(auth)/login');
    expect(posthog!.reset).toHaveBeenCalled();
    expect(signOutOfGoogle).toHaveBeenCalled();
  });

  it('sends a signed-in user out of the auth screens and identifies them', async () => {
    setSegments(['(auth)', 'login']);
    await renderLayout();
    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
    expect(posthog!.identify).toHaveBeenCalledWith(TEST_USER.id, { email: TEST_USER.email });
  });

  it('lets a user who just verified a reset code finish setting the password', async () => {
    setSegments(['(auth)', 'forgot-password']);
    await renderLayout();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('follows sign-out events after load', async () => {
    setSegments(['(tabs)']);
    await renderLayout();
    expect(router.replace).not.toHaveBeenCalled();
    act(() => emitAuthChange('SIGNED_OUT', null));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(auth)/login'));
    act(() => emitAuthChange('SIGNED_IN', TEST_SESSION));
    expect(posthog!.identify).toHaveBeenCalledTimes(2);
  });
});

describe('RootLayout side effects', () => {
  it('drains the offline receipt queue when the network comes back', async () => {
    setSegments(['(tabs)']);
    await renderLayout();
    const listener = (NetInfo.addEventListener as jest.Mock).mock.calls.at(-1)[0];
    listener({ isConnected: false });
    expect(drainQueue).not.toHaveBeenCalled();
    listener({ isConnected: true });
    expect(drainQueue).toHaveBeenCalled();
  });

  it('opens the receipt from a tapped notification', async () => {
    setSegments(['(tabs)']);
    await renderLayout();
    const onResponse = N.addNotificationResponseReceivedListener.mock.calls.at(-1)![0];
    onResponse({ notification: { request: { content: { data: { receiptId: 'r9' } } } } } as never);
    expect(router.push).toHaveBeenCalledWith('/receipt-success?receiptId=r9');
    onResponse({ notification: { request: { content: { data: {} } } } } as never);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('removes notification listeners on unmount', async () => {
    const remove = jest.fn();
    N.addNotificationResponseReceivedListener.mockReturnValueOnce({ remove } as never);
    setSegments(['(tabs)']);
    const { unmount } = await renderLayout();
    unmount();
    expect(remove).toHaveBeenCalled();
  });
});
