import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import RegisterScreen from '../../app/(auth)/register';
import { posthog } from '../../lib/posthog';
import { renderWithProviders } from '../../test-utils/render';
import { router, setParams } from '../../test-utils/routerMock';
import { supabaseMock, TEST_SESSION, TEST_USER } from '../../test-utils/supabaseMock';

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

async function submitForm(email: string, password: string) {
  fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), email);
  fireEvent.changeText(screen.getByPlaceholderText('Min. 8 characters'), password);
  fireEvent.press(screen.getByText('Create Account'));
}

describe('RegisterScreen — form step', () => {
  it('validates required fields and password length', async () => {
    await renderWithProviders(<RegisterScreen />);
    fireEvent.press(screen.getByText('Create Account'));
    expect(alertSpy).toHaveBeenLastCalledWith('Missing fields', expect.any(String));
    await submitForm('sam@example.com', 'short');
    expect(alertSpy).toHaveBeenLastCalledWith('Password too short', expect.any(String));
    expect(supabaseMock.auth.signUp).not.toHaveBeenCalled();
  });

  it('signs up and moves to the code step', async () => {
    await renderWithProviders(<RegisterScreen />);
    await submitForm(' sam@example.com ', 'longenough');
    expect(await screen.findByText('Confirm your email')).toBeTruthy();
    expect(supabaseMock.auth.signUp).toHaveBeenCalledWith({
      email: 'sam@example.com',
      password: 'longenough',
    });
    expect(posthog!.capture).toHaveBeenCalledWith('user_registered', { sign_up_method: 'email' });
  });

  it('stays on the form when sign-up returns a session (confirmations off)', async () => {
    supabaseMock.auth.signUp.mockResolvedValueOnce({
      data: { user: TEST_USER, session: TEST_SESSION },
      error: null,
    } as never);
    await renderWithProviders(<RegisterScreen />);
    await submitForm('sam@example.com', 'longenough');
    await waitFor(() =>
      expect(posthog!.capture).toHaveBeenCalledWith('user_registered', expect.anything()),
    );
    expect(screen.queryByText('Confirm your email')).toBeNull();
  });

  it('shows the sign-up error', async () => {
    supabaseMock.auth.signUp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'User already registered' },
    } as never);
    await renderWithProviders(<RegisterScreen />);
    await submitForm('sam@example.com', 'longenough');
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Sign up failed', 'User already registered'),
    );
  });

  it('goes back to sign in', async () => {
    await renderWithProviders(<RegisterScreen />);
    fireEvent.press(screen.getByText('Sign in'));
    expect(router.back).toHaveBeenCalled();
  });
});

describe('RegisterScreen — code step', () => {
  beforeEach(() => setParams({ verifyEmail: 'sam@example.com' }));

  it('opens straight on the code step when coming from sign-in', async () => {
    await renderWithProviders(<RegisterScreen />);
    expect(screen.getByText('Confirm your email')).toBeTruthy();
  });

  it('requires all 8 digits', async () => {
    await renderWithProviders(<RegisterScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('12345678'), '1234');
    fireEvent.press(screen.getByText('Verify Email'));
    expect(alertSpy).toHaveBeenCalledWith('Enter the code', expect.any(String));
    expect(supabaseMock.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('verifies the code', async () => {
    await renderWithProviders(<RegisterScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('12345678'), '12345678');
    fireEvent.press(screen.getByText('Verify Email'));
    await waitFor(() => expect(posthog!.capture).toHaveBeenCalledWith('email_verified'));
    expect(supabaseMock.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'sam@example.com',
      token: '12345678',
      type: 'signup',
    });
  });

  it('rejects a bad code', async () => {
    supabaseMock.auth.verifyOtp.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Token has expired or is invalid' },
    } as never);
    await renderWithProviders(<RegisterScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('12345678'), '00000000');
    fireEvent.press(screen.getByText('Verify Email'));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Code not accepted', expect.any(String)),
    );
  });

  it('resends the code', async () => {
    await renderWithProviders(<RegisterScreen />);
    fireEvent.press(screen.getByText('Resend code'));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Code sent',
        'A new code is on its way to sam@example.com.',
      ),
    );
  });

  it('reports a failed resend', async () => {
    supabaseMock.auth.resend.mockResolvedValueOnce({
      data: {},
      error: { message: 'Rate limited' },
    } as never);
    await renderWithProviders(<RegisterScreen />);
    fireEvent.press(screen.getByText('Resend code'));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Could not resend code', 'Rate limited'),
    );
  });

  it('can start over', async () => {
    await renderWithProviders(<RegisterScreen />);
    fireEvent.press(screen.getByText('Start over'));
    expect(await screen.findByText('Create account')).toBeTruthy();
  });
});
