import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import LoginScreen from '../../app/(auth)/login';
import { getGoogleIdToken } from '../../lib/googleSignIn';
import { posthog } from '../../lib/posthog';
import { renderWithProviders } from '../../test-utils/render';
import { router } from '../../test-utils/routerMock';
import { lastQuery, supabaseMock, TEST_USER } from '../../test-utils/supabaseMock';

jest.mock('../../lib/googleSignIn', () => ({
  googleSignInAvailable: true,
  getGoogleIdToken: jest.fn(),
}));

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
const signedIn = { data: { session: {}, user: TEST_USER }, error: null } as never;

async function fillAndSubmit(email: string, password: string) {
  fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), email);
  fireEvent.changeText(screen.getByPlaceholderText('••••••••'), password);
  fireEvent.press(screen.getByText('Sign In'));
}

describe('LoginScreen', () => {
  it('renders the form and social options', async () => {
    await renderWithProviders(<LoginScreen />);
    expect(screen.getByText('BULKMATE')).toBeTruthy();
    expect(screen.getByText('Sign in')).toBeTruthy();
    expect(screen.getByLabelText('Sign in with Google')).toBeTruthy();
    expect(screen.getByTestId('apple-sign-in')).toBeTruthy();
  });

  it('asks for both fields before calling Supabase', async () => {
    await renderWithProviders(<LoginScreen />);
    fireEvent.press(screen.getByText('Sign In'));
    expect(alertSpy).toHaveBeenCalledWith('Missing fields', expect.any(String));
    expect(supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('signs in with email and identifies the user', async () => {
    supabaseMock.auth.signInWithPassword.mockResolvedValueOnce(signedIn);
    await renderWithProviders(<LoginScreen />);
    await fillAndSubmit('sam@example.com', 'hunter22');
    await waitFor(() =>
      expect(posthog!.capture).toHaveBeenCalledWith('user_signed_in', { sign_in_method: 'email' }),
    );
    expect(supabaseMock.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'sam@example.com',
      password: 'hunter22',
    });
    expect(posthog!.identify).toHaveBeenCalledWith(TEST_USER.id);
    // Spinner gone, button back.
    await screen.findByText('Sign In');
  });

  it('shows the error when the password is wrong', async () => {
    supabaseMock.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: 'Invalid login credentials' },
    } as never);
    await renderWithProviders(<LoginScreen />);
    await fillAndSubmit('sam@example.com', 'wrong');
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Sign in failed', 'Invalid login credentials'),
    );
  });

  it('resends the code and opens verification for an unconfirmed account', async () => {
    supabaseMock.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { code: 'email_not_confirmed', message: 'Email not confirmed' },
    } as never);
    await renderWithProviders(<LoginScreen />);
    await fillAndSubmit(' sam@example.com ', 'hunter22');
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/(auth)/register',
        params: { verifyEmail: 'sam@example.com' },
      }),
    );
    expect(supabaseMock.auth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'sam@example.com',
    });
  });

  it('links to forgot-password and register', async () => {
    await renderWithProviders(<LoginScreen />);
    fireEvent.press(screen.getByText('Forgot password?'));
    expect(router.push).toHaveBeenCalledWith('/(auth)/forgot-password');
    fireEvent.press(screen.getByText('Create an account'));
    expect(router.push).toHaveBeenCalledWith('/(auth)/register');
  });

  describe('Google', () => {
    it('signs in with the Google ID token', async () => {
      (getGoogleIdToken as jest.Mock).mockResolvedValueOnce('google-id-token');
      supabaseMock.auth.signInWithIdToken.mockResolvedValueOnce(signedIn);
      await renderWithProviders(<LoginScreen />);
      fireEvent.press(screen.getByLabelText('Sign in with Google'));
      await waitFor(() =>
        expect(supabaseMock.auth.signInWithIdToken).toHaveBeenCalledWith({
          provider: 'google',
          token: 'google-id-token',
        }),
      );
      await waitFor(() =>
        expect(posthog!.capture).toHaveBeenCalledWith('user_signed_in', {
          sign_in_method: 'google',
        }),
      );
    });

    it('does nothing when the user closes the Google sheet', async () => {
      (getGoogleIdToken as jest.Mock).mockResolvedValueOnce(null);
      await renderWithProviders(<LoginScreen />);
      fireEvent.press(screen.getByLabelText('Sign in with Google'));
      await waitFor(() => expect(getGoogleIdToken).toHaveBeenCalled());
      expect(supabaseMock.auth.signInWithIdToken).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('alerts on a Google failure', async () => {
      (getGoogleIdToken as jest.Mock).mockRejectedValueOnce(new Error('DEVELOPER_ERROR'));
      await renderWithProviders(<LoginScreen />);
      fireEvent.press(screen.getByLabelText('Sign in with Google'));
      await waitFor(() =>
        expect(alertSpy).toHaveBeenCalledWith('Google sign-in failed', 'Please try again.'),
      );
    });

    it('alerts when Supabase rejects the Google token', async () => {
      (getGoogleIdToken as jest.Mock).mockResolvedValueOnce('google-id-token');
      supabaseMock.auth.signInWithIdToken.mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: 'Unacceptable audience' },
      } as never);
      await renderWithProviders(<LoginScreen />);
      fireEvent.press(screen.getByLabelText('Sign in with Google'));
      await waitFor(() =>
        expect(alertSpy).toHaveBeenCalledWith('Google sign-in failed', 'Unacceptable audience'),
      );
    });
  });

  describe('Apple', () => {
    it('signs in and saves the name Apple returns on first sign-in', async () => {
      (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValueOnce({
        identityToken: 'apple-token',
        fullName: { givenName: 'Sam', familyName: 'Lee' },
      });
      supabaseMock.auth.signInWithIdToken.mockResolvedValueOnce(signedIn);
      await renderWithProviders(<LoginScreen />);
      fireEvent.press(screen.getByTestId('apple-sign-in'));
      await waitFor(() =>
        expect(posthog!.capture).toHaveBeenCalledWith('user_signed_in', {
          sign_in_method: 'apple',
        }),
      );
      const q = lastQuery('profiles');
      expect(q?.op).toBe('update');
      expect(q?.payload).toEqual({ first_name: 'Sam', last_name: 'Lee', display_name: 'Sam Lee' });
      // Never overwrite a name the user already set.
      expect(q?.filters).toContainEqual(['is', 'first_name', null]);
    });

    it('ignores a cancelled Apple sheet', async () => {
      (AppleAuthentication.signInAsync as jest.Mock).mockRejectedValueOnce({
        code: 'ERR_REQUEST_CANCELED',
      });
      await renderWithProviders(<LoginScreen />);
      fireEvent.press(screen.getByTestId('apple-sign-in'));
      await waitFor(() => expect(AppleAuthentication.signInAsync).toHaveBeenCalled());
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('alerts when Apple sign-in fails', async () => {
      (AppleAuthentication.signInAsync as jest.Mock).mockRejectedValueOnce(new Error('boom'));
      await renderWithProviders(<LoginScreen />);
      fireEvent.press(screen.getByTestId('apple-sign-in'));
      await waitFor(() =>
        expect(alertSpy).toHaveBeenCalledWith('Apple sign-in failed', 'Please try again.'),
      );
    });
  });
});
