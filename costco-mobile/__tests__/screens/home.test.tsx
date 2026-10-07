import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import HomeScreen from '../../app/(tabs)/index';
import { posthog } from '../../lib/posthog';
import { renderWithProviders } from '../../test-utils/render';
import { router } from '../../test-utils/routerMock';
import { lastQuery, mockTable, TEST_USER } from '../../test-utils/supabaseMock';

function seedDashboard({ firstName = 'Sam' as string | null } = {}) {
  mockTable('profiles', { data: { first_name: firstName }, error: null });
  mockTable('receipts', (q) =>
    q.columns === 'id, total_amount'
      ? {
          data: [
            { id: 'r1', total_amount: 48.75 },
            { id: 'r2', total_amount: 20 },
          ],
          error: null,
        }
      : {
          data: [
            {
              id: 'r1',
              transaction_date: '2026-10-05',
              total_amount: 48.75,
              warehouses: { name: 'Almaden' },
              receipt_items: [{ id: 'i1' }, { id: 'i2' }],
            },
            {
              id: 'r2',
              transaction_date: '2026-10-01',
              total_amount: 20,
              warehouses: null,
              receipt_items: [{ id: 'i3' }],
            },
          ],
          error: null,
        },
  );
  mockTable('receipt_items', [
    { unit_price: 12.99, discount_amount: 2 },
    { unit_price: 5, discount_amount: null },
  ]);
  mockTable('price_alerts', [
    {
      id: 'a1',
      sku: '1518783',
      paid_price: '12.99',
      current_price: '9.99',
      delta: '3.00',
      receipt_items: { description: 'KS COCONUT WATER', receipt_id: 'r1' },
    },
  ]);
  mockTable('product_lookups', [
    {
      sku: '555',
      name: 'Olive Oil',
      brand: 'KS',
      image_url: null,
      sale_price: 18.99,
      looked_up_at: '2026-10-06T10:00:00Z',
    },
    {
      sku: '555',
      name: 'Olive Oil (older)',
      brand: 'KS',
      image_url: null,
      sale_price: 19.99,
      looked_up_at: '2026-10-02T10:00:00Z',
    },
  ]);
}

describe('HomeScreen', () => {
  it('shows totals, alerts and the merged recent feed', async () => {
    seedDashboard();
    await renderWithProviders(<HomeScreen />);

    expect(await screen.findByText('Sam')).toBeTruthy();
    expect(screen.getByText('$68.75')).toBeTruthy(); // total spent across all receipts
    expect(screen.getByText('$2.00')).toBeTruthy(); // total saved
    expect(screen.getByText('2')).toBeTruthy(); // receipt count

    expect(screen.getByText('KS COCONUT WATER')).toBeTruthy();
    expect(screen.getByText('+$3.00')).toBeTruthy();

    expect(screen.getByText('Almaden')).toBeTruthy();
    expect(screen.getByText('Costco Warehouse')).toBeTruthy(); // receipt without a warehouse
    // Duplicate lookups of the same SKU collapse to the newest one.
    expect(screen.getByText('Olive Oil')).toBeTruthy();
    expect(screen.queryByText('Olive Oil (older)')).toBeNull();
  });

  it('filters the recent feed by kind', async () => {
    seedDashboard();
    await renderWithProviders(<HomeScreen />);
    await screen.findByText('Olive Oil');

    // 'Receipts' is also a stat label; the filter chip is the last one on screen.
    fireEvent.press(screen.getAllByText('Receipts').at(-1)!);
    expect(screen.queryByText('Olive Oil')).toBeNull();
    expect(screen.getByText('Almaden')).toBeTruthy();

    fireEvent.press(screen.getByText('Viewed'));
    expect(screen.getByText('Olive Oil')).toBeTruthy();
    expect(screen.queryByText('Almaden')).toBeNull();
  });

  it('dismisses a price alert optimistically and records it', async () => {
    seedDashboard();
    await renderWithProviders(<HomeScreen />);
    await screen.findByText('KS COCONUT WATER');

    fireEvent.press(screen.getByText('✕'), { stopPropagation: jest.fn() });
    expect(screen.queryByText('KS COCONUT WATER')).toBeNull();
    await waitFor(() => expect(posthog!.capture).toHaveBeenCalledWith('price_alert_dismissed'));
    const q = lastQuery('price_alerts');
    expect(q?.op).toBe('update');
    expect(q?.filters).toContainEqual(['eq', 'id', 'a1']);
  });

  it('navigates from alerts, feed and quick actions', async () => {
    seedDashboard();
    await renderWithProviders(<HomeScreen />);
    await screen.findByText('KS COCONUT WATER');

    fireEvent.press(screen.getByText('KS COCONUT WATER'));
    expect(router.push).toHaveBeenCalledWith('/receipt-success?receiptId=r1');
    fireEvent.press(screen.getByText('Almaden'));
    expect(router.push).toHaveBeenCalledWith('/receipt-success?receiptId=r1');
    fireEvent.press(screen.getByText('Olive Oil'));
    expect(router.push).toHaveBeenCalledWith('/product/555');
    fireEvent.press(screen.getByText('Check In'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/scan',
      params: { mode: 'checkin' },
    });
    fireEvent.press(screen.getAllByText('See all')[0]);
    expect(router.push).toHaveBeenCalledWith('/alerts');
  });

  it('shows the empty state for a new user', async () => {
    mockTable('profiles', { data: { first_name: 'Sam' }, error: null });
    await renderWithProviders(<HomeScreen />);
    expect(await screen.findByText('No receipts yet')).toBeTruthy();
    fireEvent.press(screen.getByText('Scan Receipt'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(tabs)/scan',
      params: { mode: 'receipt' },
    });
  });

  it('nudges for a name, and remembers the dismissal per user', async () => {
    seedDashboard({ firstName: null });
    await renderWithProviders(<HomeScreen />);
    expect(await screen.findByText('What should we call you?')).toBeTruthy();

    fireEvent.press(screen.getByText('What should we call you?'));
    expect(router.push).toHaveBeenCalledWith('/edit-profile');

    fireEvent.press(screen.getByLabelText(/dismiss/i));
    expect(screen.queryByText('What should we call you?')).toBeNull();
    expect(await AsyncStorage.getItem(`nameNudgeDismissed:${TEST_USER.id}`)).toBe('true');
    expect(posthog!.capture).toHaveBeenCalledWith('name_nudge_dismissed');
  });

  it('keeps the nudge hidden once dismissed', async () => {
    await AsyncStorage.setItem(`nameNudgeDismissed:${TEST_USER.id}`, 'true');
    seedDashboard({ firstName: null });
    await renderWithProviders(<HomeScreen />);
    await screen.findByText('Almaden');
    expect(screen.queryByText('What should we call you?')).toBeNull();
  });
});
