import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import ProfileScreen from '../../app/(tabs)/profile';
import { posthog } from '../../lib/posthog';
import { renderWithProviders } from '../../test-utils/render';
import { router } from '../../test-utils/routerMock';
import { lastQuery, mockFunction, mockTable, supabaseMock } from '../../test-utils/supabaseMock';

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const profile = {
  total_stars: 7,
  fan_tier: 'BulkBuyer',
  display_name: 'Sam Lee',
  first_name: 'Sam',
  last_name: 'Lee',
  phone_number: null,
  email_alerts_enabled: true,
  sms_alerts_enabled: false,
  phone_verified_at: null,
};

function seed(overrides: Partial<typeof profile> = {}) {
  mockTable('profiles', (q) =>
    q.op === 'update'
      ? { data: null, error: null }
      : { data: { ...profile, ...overrides }, error: null },
  );
  mockTable('badges', [
    {
      id: 'b1',
      name: 'First Visit',
      description: 'Check in once',
      icon: '🎉',
      trigger_key: 'first_visit',
    },
    {
      id: 'b2',
      name: 'Regular',
      description: 'Five check-ins',
      icon: '⭐',
      trigger_key: 'five_visits',
    },
  ]);
  mockTable('user_badges', [{ badge_id: 'b1', earned_at: '2026-08-11T10:00:00Z' }]);
}

function pressAlertButton(text: string) {
  const buttons = alertSpy.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => unknown }[];
  return buttons.find((b) => b.text === text)!.onPress?.();
}

describe('ProfileScreen', () => {
  it('shows the member, tier progress and badges', async () => {
    seed();
    await renderWithProviders(<ProfileScreen />);
    expect(await screen.findByText('Sam Lee')).toBeTruthy();
    expect(screen.getByText('sam@example.com')).toBeTruthy();
    expect(screen.getAllByText('Bulk Buyer').length).toBeGreaterThan(0);
    expect(screen.getByText('First Visit')).toBeTruthy();
    expect(screen.getByText('🔒')).toBeTruthy(); // the badge not yet earned
  });

  it('shows only the email when no name is set, and the top tier message', async () => {
    seed({
      first_name: null as never,
      last_name: null as never,
      fan_tier: 'ExecutiveExplorer',
      total_stars: 30,
    });
    await renderWithProviders(<ProfileScreen />);
    expect(await screen.findByText('Maximum tier reached 🎉')).toBeTruthy();
    expect(screen.getByText('sam@example.com')).toBeTruthy();
    expect(screen.queryByText('Sam Lee')).toBeNull();
  });

  it('toggles price-drop emails optimistically', async () => {
    seed();
    await renderWithProviders(<ProfileScreen />);
    await screen.findByText('Sam Lee');
    fireEvent(screen.getByRole('switch'), 'valueChange', false);
    await waitFor(() =>
      expect(posthog!.capture).toHaveBeenCalledWith('alert_channel_changed', {
        email_alerts_enabled: false,
      }),
    );
    expect(lastQuery('profiles')?.payload).toEqual({ email_alerts_enabled: false });
  });

  it('reverts the toggle when saving fails', async () => {
    seed();
    await renderWithProviders(<ProfileScreen />);
    await screen.findByText('Sam Lee');
    mockTable('profiles', { data: null, error: new Error('offline') });
    fireEvent(screen.getByRole('switch'), 'valueChange', false);
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Could not save', 'Please try again.'),
    );
    expect(screen.getByRole('switch').props.value).toBe(true);
  });

  it('enables push notifications', async () => {
    seed();
    mockTable('profiles', (q) =>
      q.op === 'update' ? { data: null, error: null } : { data: profile, error: null },
    );
    await renderWithProviders(<ProfileScreen />);
    fireEvent.press(await screen.findByText('Enable'));
    expect(await screen.findByText('On')).toBeTruthy();
    expect(posthog!.capture).toHaveBeenCalledWith('notifications_enabled');
  });

  it('links to settings when notifications were denied', async () => {
    // The focus effect runs again once the session resolves — deny both reads.
    (Notifications.getPermissionsAsync as jest.Mock)
      .mockResolvedValueOnce({ status: 'denied' })
      .mockResolvedValueOnce({ status: 'denied' });
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    seed();
    await renderWithProviders(<ProfileScreen />);
    fireEvent.press(await screen.findByText('Settings'));
    expect(openSettings).toHaveBeenCalled();
  });

  it('switches the app theme and remembers it', async () => {
    seed();
    await renderWithProviders(<ProfileScreen />);
    fireEvent.press(await screen.findByText('Dark'));
    await waitFor(async () => expect(await AsyncStorage.getItem('theme_mode')).toBe('dark'));
  });

  it('opens edit profile and signs out', async () => {
    seed();
    await renderWithProviders(<ProfileScreen />);
    fireEvent.press(await screen.findByText('Edit Profile'));
    expect(router.push).toHaveBeenCalledWith('/edit-profile');
    fireEvent.press(screen.getByText('Sign Out'));
    expect(supabaseMock.auth.signOut).toHaveBeenCalled();
  });

  it('deletes the account after two confirmations', async () => {
    seed();
    mockFunction('delete-account', { data: { deleted: true }, error: null });
    await renderWithProviders(<ProfileScreen />);
    fireEvent.press(await screen.findByText('Delete Account'));
    await pressAlertButton('Continue');
    expect(alertSpy).toHaveBeenLastCalledWith(
      'Are you sure?',
      expect.any(String),
      expect.any(Array),
    );
    await pressAlertButton('Delete Forever');

    await waitFor(() => expect(supabaseMock.auth.signOut).toHaveBeenCalled());
    expect(posthog!.capture).toHaveBeenCalledWith('account_deleted');
    expect(posthog!.reset).toHaveBeenCalled();
  });

  it('keeps the user signed in when deletion fails', async () => {
    seed();
    mockFunction('delete-account', { data: { deleted: false }, error: null });
    await renderWithProviders(<ProfileScreen />);
    fireEvent.press(await screen.findByText('Delete Account'));
    await pressAlertButton('Continue');
    await pressAlertButton('Delete Forever');
    await waitFor(() =>
      expect(alertSpy).toHaveBeenLastCalledWith(
        "Couldn't delete account",
        'Account could not be deleted.',
      ),
    );
    expect(supabaseMock.auth.signOut).not.toHaveBeenCalled();
  });
});
