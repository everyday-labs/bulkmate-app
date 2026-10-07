import { Alert } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { useCheckIn } from '../useCheckIn';
import { posthog } from '../../lib/posthog';

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const respond = (status: number, body: object) =>
  fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: () => Promise.resolve(body) });

const success = {
  already_checked_in: false,
  warehouse: { name: 'Almaden', tier: 'Rare' },
  stars_earned: 2,
  tier_upgraded: false,
  new_badges: [{ trigger_key: 'first_visit' }],
};

async function run() {
  const hook = renderHook(() => useCheckIn());
  await act(() => hook.result.current.runCheckIn());
  return hook;
}

describe('useCheckIn', () => {
  it('posts the location with the session token and returns the result', async () => {
    respond(200, success);
    const { result } = await run();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://test.supabase.co/functions/v1/check-in');
    expect(init.headers.Authorization).toBe('Bearer access-token');
    expect(JSON.parse(init.body)).toEqual({ latitude: 37.25, longitude: -121.86 });
    expect(result.current.checkInResult).toEqual(success);
    expect(result.current.checkingIn).toBe(false);
    expect(posthog!.capture).toHaveBeenCalledWith('warehouse_check_in_completed', {
      warehouse_tier: 'Rare',
      tier_upgraded: false,
      badges_earned_count: 1,
    });

    act(() => result.current.clearCheckInResult());
    expect(result.current.checkInResult).toBeNull();
  });

  it('does not record a repeat check-in as a new one', async () => {
    respond(200, { ...success, already_checked_in: true });
    await run();
    expect(posthog!.capture).not.toHaveBeenCalledWith(
      'warehouse_check_in_completed',
      expect.anything(),
    );
  });

  it('explains when location permission is denied', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'denied',
    });
    await run();
    expect(alertSpy).toHaveBeenCalledWith('Location Required', expect.any(String));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports how far away the nearest warehouse is', async () => {
    respond(400, {
      error: 'too_far',
      distance_metres: 3218.68,
      nearest_warehouse: { name: 'Almaden' },
    });
    const { result } = await run();
    expect(result.current.tooFarInfo).toEqual({ miles: '2.0', warehouse: 'Almaden' });
    act(() => result.current.clearTooFarInfo());
    expect(result.current.tooFarInfo).toBeNull();
  });

  it('handles a too-far response without details', async () => {
    respond(400, { error: 'too_far' });
    const { result } = await run();
    expect(result.current.tooFarInfo).toEqual({ miles: '?', warehouse: 'the nearest Costco' });
  });

  it('shows server errors', async () => {
    respond(500, { error: 'warehouse_lookup_failed' });
    await run();
    expect(alertSpy).toHaveBeenCalledWith('Check-In Failed', 'warehouse_lookup_failed');
  });

  it('handles a location failure', async () => {
    (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValueOnce(new Error('timeout'));
    const { result } = await run();
    expect(alertSpy).toHaveBeenCalledWith(
      'Check-In Failed',
      'Could not get your location. Please try again.',
    );
    expect(result.current.checkingIn).toBe(false);
  });
});
