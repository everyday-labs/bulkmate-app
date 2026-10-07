import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import ForgotPasswordScreen from '../../app/(auth)/forgot-password';
import { posthog } from '../../lib/posthog';
import { renderWithProviders } from '../../test-utils/render';
import { router } from '../../test-utils/routerMock';
import { supabaseMock } from '../../test-utils/supabaseMock';

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
const failure = (message: string) =>
  ({ data: { user: null, session: null }, error: { message } }) as never;

async function toCodeStep() {
  await renderWithProviders(<ForgotPasswordScreen />);
  fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), ' sam@example.com ');
  fireEvent.press(screen.getByText('Send Code'));
  await screen.findByText('Verify Code');
}

async function toPasswordStep() {
  await toCodeStep();
  fireEvent.changeText(screen.getByPlaceholderText('12345678'), '12345678');
  fireEvent.press(screen.getByText('Verify Code'));
  await screen.findByText('Save Password');
}

describe('ForgotPasswordScreen', () => {
  it('requires an email', async () => {
    await renderWithProviders(<ForgotPasswordScreen />);
    fireEvent.press(screen.getByText('Send Code'));
    expect(alertSpy).toHaveBeenCalledWith('Missing email', expect.any(String));
  });

  it('sends the reset code to the trimmed email', async () => {
    await toCodeStep();
    expect(supabaseMock.auth.resetPasswordForEmail).toHaveBeenCalledWith('sam@example.com');
    expect(posthog!.capture).toHaveBeenCalledWith('password_reset_requested');
  });

  it('reports a failure to send', async () => {
    supabaseMock.auth.resetPasswordForEmail.mockResolvedValueOnce(failure('Rate limited'));
    await renderWithProviders(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'sam@example.com');
    fireEvent.press(screen.getByText('Send Code'));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Could not send code', 'Rate limited'),
    );
  });

  it('validates and verifies the recovery code', async () => {
    await toCodeStep();
    fireEvent.press(screen.getByText('Verify Code'));
    expect(alertSpy).toHaveBeenCalledWith('Enter the code', expect.any(String));

    fireEvent.changeText(screen.getByPlaceholderText('12345678'), '12345678');
    fireEvent.press(screen.getByText('Verify Code'));
    expect(await screen.findByText('Save Password')).toBeTruthy();
    expect(supabaseMock.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'sam@example.com',
      token: '12345678',
      type: 'recovery',
    });
  });

  it('rejects a bad recovery code', async () => {
    await toCodeStep();
    supabaseMock.auth.verifyOtp.mockResolvedValueOnce(failure('expired'));
    fireEvent.changeText(screen.getByPlaceholderText('12345678'), '00000000');
    fireEvent.press(screen.getByText('Verify Code'));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Code not accepted', expect.any(String)),
    );
  });

  it('validates the new password', async () => {
    await toPasswordStep();
    fireEvent.changeText(screen.getByPlaceholderText('Min. 8 characters'), 'short');
    fireEvent.press(screen.getByText('Save Password'));
    expect(alertSpy).toHaveBeenLastCalledWith('Password too short', expect.any(String));

    fireEvent.changeText(screen.getByPlaceholderText('Min. 8 characters'), 'longenough');
    fireEvent.changeText(screen.getByPlaceholderText('Re-enter password'), 'different1');
    fireEvent.press(screen.getByText('Save Password'));
    expect(alertSpy).toHaveBeenLastCalledWith('Passwords don’t match', expect.any(String));
    expect(supabaseMock.auth.updateUser).not.toHaveBeenCalled();
  });

  it('saves the new password and goes home', async () => {
    await toPasswordStep();
    fireEvent.changeText(screen.getByPlaceholderText('Min. 8 characters'), 'longenough');
    fireEvent.changeText(screen.getByPlaceholderText('Re-enter password'), 'longenough');
    fireEvent.press(screen.getByText('Save Password'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(tabs)'));
    expect(supabaseMock.auth.updateUser).toHaveBeenCalledWith({ password: 'longenough' });
    expect(posthog!.capture).toHaveBeenCalledWith('password_reset_completed');
  });

  it('reports a failed password update', async () => {
    await toPasswordStep();
    supabaseMock.auth.updateUser.mockResolvedValueOnce(failure('Same password'));
    fireEvent.changeText(screen.getByPlaceholderText('Min. 8 characters'), 'longenough');
    fireEvent.changeText(screen.getByPlaceholderText('Re-enter password'), 'longenough');
    fireEvent.press(screen.getByText('Save Password'));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Could not update password', 'Same password'),
    );
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('resends the code and goes back to sign in', async () => {
    await toCodeStep();
    fireEvent.press(screen.getByText('Resend code'));
    await waitFor(() => expect(supabaseMock.auth.resetPasswordForEmail).toHaveBeenCalledTimes(2));
    fireEvent.press(screen.getByText('Back to sign in'));
    expect(router.back).toHaveBeenCalled();
  });
});
