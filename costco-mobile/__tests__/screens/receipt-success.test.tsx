import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Share } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import ReceiptSuccessScreen from '../../app/receipt-success';
import { posthog } from '../../lib/posthog';
import { renderWithProviders } from '../../test-utils/render';
import { router, setParams } from '../../test-utils/routerMock';
import {
  lastQuery,
  mockFunction,
  mockTable,
  queriesFor,
  supabaseMock,
} from '../../test-utils/supabaseMock';

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const receiptRow = (overrides: object = {}) => ({
  id: 'r1',
  transaction_date: '2026-08-11',
  transaction_number: '123456789012',
  total_amount: 25.98,
  tax_amount: 1.2,
  image_path: 'user-1/1.jpg',
  warehouse_id: 'w1',
  warehouses: { name: 'Almaden', address: '5301 Almaden Expy', city: 'San Jose', state: 'CA' },
  ...overrides,
});
const items = [
  {
    id: 'i1',
    sku: '1518783',
    description: 'KS COCONUT WATER',
    unit_price: 12.99,
    quantity: 2,
    discount_amount: 3,
  },
  {
    id: 'i2',
    sku: '7812',
    description: 'YELLOW ONION',
    unit_price: 2.49,
    quantity: 1,
    discount_amount: 0,
  },
];

function seed(receipt = receiptRow()) {
  mockTable('receipts', (q) =>
    q.op === 'delete' ? { data: null, error: null } : { data: receipt, error: null },
  );
  mockTable('receipt_items', (q) =>
    q.op === 'update' ? { data: null, error: null } : { data: items, error: null },
  );
}

/** Press a button inside the most recent Alert.alert call. */
function pressAlertButton(text: string) {
  const buttons = alertSpy.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => unknown }[];
  return buttons.find((b) => b.text === text)!.onPress?.();
}

describe('ReceiptSuccessScreen', () => {
  beforeEach(async () => {
    setParams({ receiptId: 'r1' });
    // Notification prompt already handled unless a test opts back in.
    await AsyncStorage.setItem('push_permission_prompted', 'true');
  });

  it('shows the warehouse, TC#, items and totals', async () => {
    seed();
    await renderWithProviders(<ReceiptSuccessScreen />);
    expect(await screen.findByText('Receipt Scanned')).toBeTruthy();
    expect(screen.getByText('Almaden')).toBeTruthy();
    expect(screen.getByText('5301 Almaden Expy')).toBeTruthy();
    expect(screen.getByText('San Jose, CA')).toBeTruthy();
    expect(screen.getByText('123456789012')).toBeTruthy();
    expect(screen.getByText('KS COCONUT WATER')).toBeTruthy();
    expect(screen.getByText('$25.98')).toBeTruthy(); // 2 × 12.99
    expect(screen.getByText('$12.99 each')).toBeTruthy();
    // Shown on the item row and again in the instant-savings total.
    expect(screen.getAllByText('−$3.00')).toHaveLength(2);
    expect(screen.getByText('Tap to view full receipt')).toBeTruthy();
    expect(supabaseMock.storage.from).toHaveBeenCalledWith('receipts');
  });

  it('flags a duplicate upload and a missing TC#', async () => {
    setParams({ receiptId: 'r1', duplicate: 'true' });
    seed(receiptRow({ transaction_number: null, image_path: null }));
    await renderWithProviders(<ReceiptSuccessScreen />);
    expect(await screen.findByText(/already uploaded/)).toBeTruthy();
    expect(screen.getByText('TC# not found on receipt')).toBeTruthy();
    expect(screen.queryByText('Tap to view full receipt')).toBeNull();
  });

  it('shows a load error with a way back', async () => {
    mockTable('receipts', { data: null, error: new Error('Receipt not found') });
    await renderWithProviders(<ReceiptSuccessScreen />);
    expect(await screen.findByText('Receipt not found')).toBeTruthy();
    router.canGoBack.mockReturnValueOnce(false);
    fireEvent.press(screen.getByText('Back to Scan'));
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/scan');
  });

  it('edits a line item', async () => {
    seed();
    await renderWithProviders(<ReceiptSuccessScreen />);
    fireEvent.press(await screen.findByText('YELLOW ONION'));
    fireEvent.changeText(screen.getByDisplayValue('2.49'), '2.99');
    fireEvent.changeText(screen.getAllByDisplayValue('1')[0], '3');
    fireEvent.press(screen.getByText('✓ Done'));

    await waitFor(() => expect(posthog!.capture).toHaveBeenCalledWith('receipt_item_edited'));
    const q = lastQuery('receipt_items');
    expect(q?.op).toBe('update');
    expect(q?.payload).toEqual({ quantity: 3, unit_price: 2.99, discount_amount: 0 });
    expect(q?.filters).toContainEqual(['eq', 'id', 'i2']);
    expect(await screen.findByText('$8.97')).toBeTruthy();
  });

  it('cancels an edit and reports a failed save', async () => {
    seed();
    await renderWithProviders(<ReceiptSuccessScreen />);
    fireEvent.press(await screen.findByText('YELLOW ONION'));
    fireEvent.press(screen.getByText('✕ Cancel'));
    expect(screen.queryByText('✓ Done')).toBeNull();

    mockTable('receipt_items', (q) =>
      q.op === 'update'
        ? { data: null, error: new Error('RLS denied') }
        : { data: items, error: null },
    );
    fireEvent.press(screen.getByText('YELLOW ONION'));
    fireEvent.press(screen.getByText('✓ Done'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Couldn't save", 'RLS denied'));
  });

  it('deletes the receipt and its image after confirmation', async () => {
    seed();
    await renderWithProviders(<ReceiptSuccessScreen />);
    fireEvent.press(await screen.findByText('Delete Receipt'));
    expect(alertSpy).toHaveBeenCalledWith('Delete Receipt', expect.any(String), expect.any(Array));
    await pressAlertButton('Delete');

    expect(lastQuery('receipts')?.op).toBe('delete');
    expect(posthog!.capture).toHaveBeenCalledWith('receipt_deleted');
    expect(router.back).toHaveBeenCalled();
  });

  it('reports a failed delete', async () => {
    seed();
    await renderWithProviders(<ReceiptSuccessScreen />);
    fireEvent.press(await screen.findByText('Delete Receipt'));
    mockTable('receipts', { data: null, error: new Error('nope') });
    await pressAlertButton('Delete');
    expect(alertSpy).toHaveBeenLastCalledWith('Error', 'nope');
  });

  it('shares the TC#', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    seed();
    await renderWithProviders(<ReceiptSuccessScreen />);
    fireEvent.press(await screen.findByText('Share'));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ message: 'TC# 123456789012' }));
  });

  describe('unknown warehouse', () => {
    const warehouses = [
      { id: 'w9', name: 'Coleman', address: '1601 Coleman Ave', city: 'Santa Clara', state: 'CA' },
    ];

    it('lets the user pick a warehouse and credits the visit', async () => {
      seed(receiptRow({ warehouse_id: null, warehouses: null }));
      mockTable('warehouses', warehouses);
      mockFunction('check-in', { data: { already_checked_in: false }, error: null });
      await renderWithProviders(<ReceiptSuccessScreen />);

      fireEvent.press(await screen.findByText(/unable to find the correct warehouse/));
      expect(await screen.findByText('Which warehouse was this?')).toBeTruthy();
      fireEvent.press(await screen.findByText('Coleman'));

      await waitFor(() =>
        expect(alertSpy).toHaveBeenCalledWith(
          'Visit credited',
          'You earned a star for your visit to Coleman.',
        ),
      );
      expect(queriesFor('fn:check-in')[0].payload).toEqual({
        receipt_id: 'r1',
        warehouse_id: 'w9',
      });
      expect(screen.getByText('1601 Coleman Ave')).toBeTruthy();
    });

    it('searches warehouses in the picker', async () => {
      seed(receiptRow({ warehouse_id: null, warehouses: null }));
      mockTable('warehouses', []);
      await renderWithProviders(<ReceiptSuccessScreen />);
      fireEvent.press(await screen.findByText(/unable to find the correct warehouse/));
      fireEvent.changeText(screen.getByPlaceholderText('Search by name, city, or ZIP'), '95050');
      expect(await screen.findByText('No warehouses match “95050”.')).toBeTruthy();
      expect(
        lastQuery('warehouses')?.filters.some(
          ([f, v]) => f === 'or' && String(v).includes('95050'),
        ),
      ).toBe(true);
    });

    it('can be skipped and added later', async () => {
      seed(receiptRow({ warehouse_id: null, warehouses: null }));
      await renderWithProviders(<ReceiptSuccessScreen />);
      fireEvent.press(await screen.findByText(/unable to find the correct warehouse/));
      fireEvent.press(await screen.findByText("Can't find my warehouse"));
      expect(await screen.findByText('Saved without a warehouse')).toBeTruthy();
      expect(posthog!.capture).toHaveBeenCalledWith('receipt_warehouse_skipped');
    });

    it('reports a failed check-in', async () => {
      seed(receiptRow({ warehouse_id: null, warehouses: null }));
      mockTable('warehouses', warehouses);
      mockFunction('check-in', { data: null, error: new Error('Too far') });
      await renderWithProviders(<ReceiptSuccessScreen />);
      fireEvent.press(await screen.findByText(/unable to find the correct warehouse/));
      fireEvent.press(await screen.findByText('Coleman'));
      await waitFor(() =>
        expect(alertSpy).toHaveBeenCalledWith("Couldn't save warehouse", 'Too far'),
      );
    });
  });

  describe('notification prompt', () => {
    beforeEach(() => AsyncStorage.removeItem('push_permission_prompted'));

    it('asks once, and saves the push token when allowed', async () => {
      seed();
      mockTable('profiles', { data: null, error: null });
      await renderWithProviders(<ReceiptSuccessScreen />);
      fireEvent.press(await screen.findByText('Enable Notifications', {}, { timeout: 4000 }));
      await waitFor(() => expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalled());
      expect(await AsyncStorage.getItem('push_permission_prompted')).toBe('true');
      await waitFor(() =>
        expect(lastQuery('profiles')?.payload).toEqual({ push_token: 'ExponentPushToken[test]' }),
      );
    });

    it('can be dismissed', async () => {
      seed();
      await renderWithProviders(<ReceiptSuccessScreen />);
      fireEvent.press(await screen.findByText('Not Now', {}, { timeout: 4000 }));
      await waitFor(() => expect(screen.queryByText('Stay in the loop')).toBeNull());
      expect(await AsyncStorage.getItem('push_permission_prompted')).toBe('true');
      expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    });
  });
});
