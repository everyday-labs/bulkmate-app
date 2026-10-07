import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import EditProfileScreen from '../../app/edit-profile';
import { posthog } from '../../lib/posthog';
import { renderWithProviders } from '../../test-utils/render';
import { router } from '../../test-utils/routerMock';
import { lastQuery, mockTable } from '../../test-utils/supabaseMock';

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

function seed(result: { error: Error | null } = { error: null }) {
  mockTable('profiles', (q) =>
    q.op === 'update'
      ? { data: null, error: result.error }
      : { data: { first_name: 'Sam', last_name: null, phone_number: '+15551234567' }, error: null },
  );
}

describe('EditProfileScreen', () => {
  it('loads the current profile', async () => {
    seed();
    await renderWithProviders(<EditProfileScreen />);
    expect(await screen.findByDisplayValue('Sam')).toBeTruthy();
    expect(screen.getByDisplayValue('+15551234567')).toBeTruthy();
  });

  it('saves trimmed values, a display name, and nulls for blanks', async () => {
    seed();
    await renderWithProviders(<EditProfileScreen />);
    await screen.findByDisplayValue('Sam');
    fireEvent.changeText(screen.getByPlaceholderText('First'), ' Sam ');
    fireEvent.changeText(screen.getByPlaceholderText('Last'), ' Lee ');
    fireEvent.changeText(screen.getByPlaceholderText('+1 (555) 123-4567'), '  ');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(lastQuery('profiles')?.payload).toEqual({
      first_name: 'Sam',
      last_name: 'Lee',
      phone_number: null,
      display_name: 'Sam Lee',
    });
    expect(lastQuery('profiles')?.filters).toContainEqual(['eq', 'id', 'user-1']);
    expect(posthog!.capture).toHaveBeenCalledWith('profile_updated');
  });

  it('reports a failed save and stays on the screen', async () => {
    seed({ error: new Error('offline') });
    await renderWithProviders(<EditProfileScreen />);
    await screen.findByDisplayValue('Sam');
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Save failed', 'offline'));
    expect(router.back).not.toHaveBeenCalled();
  });

  it('cancels', async () => {
    seed();
    await renderWithProviders(<EditProfileScreen />);
    fireEvent.press(screen.getByText('Cancel'));
    expect(router.back).toHaveBeenCalled();
  });
});
