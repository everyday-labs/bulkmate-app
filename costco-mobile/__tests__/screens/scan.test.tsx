import { fireEvent, screen } from '@testing-library/react-native';
import ScanScreen from '../../app/(tabs)/scan';
import { CheckInModal } from '../../components/CheckInModals';
import { LightColors } from '../../constants/colors';
import { useCheckIn } from '../../hooks/useCheckIn';
import { renderWithProviders } from '../../test-utils/render';
import { router, setParams } from '../../test-utils/routerMock';

jest.mock('../../hooks/useCheckIn', () => ({ useCheckIn: jest.fn() }));

const hook = (overrides: object = {}) => ({
  checkingIn: false,
  checkInResult: null,
  tooFarInfo: null,
  runCheckIn: jest.fn(),
  clearCheckInResult: jest.fn(),
  clearTooFarInfo: jest.fn(),
  ...overrides,
});

const result = {
  warehouse: { name: 'Kona', city: 'Kailua-Kona', tier: 'Legendary', distance_metres: 12 },
  stars_earned: 3,
  total_stars: 14,
  fan_tier: 'GoldStarGuru',
  tier_upgraded: true,
  already_checked_in: false,
  new_badges: [{ trigger_key: 'legendary', name: 'Legend Hunter', icon: '🏆' }],
};

describe('ScanScreen', () => {
  beforeEach(() => (useCheckIn as jest.Mock).mockReturnValue(hook()));

  it('opens the receipt camera from receipt mode', async () => {
    await renderWithProviders(<ScanScreen />);
    expect(screen.getByText('Scan Receipt')).toBeTruthy();
    fireEvent.press(screen.getByText('Open Camera'));
    expect(router.push).toHaveBeenCalledWith('/receipt-camera');
    fireEvent.press(screen.getByText('Receipt History'));
    expect(router.push).toHaveBeenCalledWith('/receipts');
  });

  it('switches to barcode mode', async () => {
    await renderWithProviders(<ScanScreen />);
    fireEvent.press(screen.getByText('Barcode'));
    expect(screen.getByText('Scan Product')).toBeTruthy();
    fireEvent.press(screen.getByText('Open Camera'));
    expect(router.push).toHaveBeenCalledWith('/product-scan');
    fireEvent.press(screen.getByText('Barcode History'));
    expect(router.push).toHaveBeenCalledWith('/barcode-history');
  });

  it('runs a check-in when opened in check-in mode', async () => {
    const h = hook();
    (useCheckIn as jest.Mock).mockReturnValue(h);
    setParams({ mode: 'checkin' });
    await renderWithProviders(<ScanScreen />);
    fireEvent.press(screen.getByText('Check My Location'));
    expect(h.runCheckIn).toHaveBeenCalled();
    fireEvent.press(screen.getByText('Check-In History'));
    expect(router.push).toHaveBeenCalledWith('/checkin-history');
  });

  it('shows the check-in result and the too-far message', async () => {
    const h = hook({ checkInResult: result, tooFarInfo: { miles: '2.0', warehouse: 'Almaden' } });
    (useCheckIn as jest.Mock).mockReturnValue(h);
    setParams({ mode: 'checkin' });
    await renderWithProviders(<ScanScreen />);
    expect(screen.getByText('Checked In!')).toBeTruthy();
    expect(screen.getByText('Still in Aisle Zero')).toBeTruthy();
    fireEvent.press(screen.getByText('Got it'));
    expect(h.clearTooFarInfo).toHaveBeenCalled();
    fireEvent.press(screen.getByText('Done'));
    expect(h.clearCheckInResult).toHaveBeenCalled();
  });
});

describe('CheckInModals', () => {
  it('celebrates stars, a tier upgrade and new badges', async () => {
    await renderWithProviders(
      <CheckInModal result={result} onClose={jest.fn()} Colors={LightColors} />,
    );
    expect(screen.getByText('Kona')).toBeTruthy();
    expect(screen.getByText('+3')).toBeTruthy();
    expect(screen.getByText('STARS EARNED')).toBeTruthy();
    expect(screen.getByText('14')).toBeTruthy();
    expect(screen.getByText('Tier Upgrade!')).toBeTruthy();
    expect(screen.getByText('NEW BADGES EARNED')).toBeTruthy();
    expect(screen.getByText('Legend Hunter')).toBeTruthy();
  });

  it('tells a repeat visitor they already have today’s star', async () => {
    await renderWithProviders(
      <CheckInModal
        result={{
          ...result,
          already_checked_in: true,
          stars_earned: 0,
          tier_upgraded: false,
          new_badges: [],
        }}
        onClose={jest.fn()}
        Colors={LightColors}
      />,
    );
    expect(screen.getByText('Already Checked In')).toBeTruthy();
    expect(screen.getByText(/already earned your star here today/)).toBeTruthy();
  });
});
