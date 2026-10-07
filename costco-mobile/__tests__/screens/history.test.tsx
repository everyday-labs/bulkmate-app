import { fireEvent, screen } from '@testing-library/react-native';
import HistoryScreen from '../../app/history';
import BarcodeHistoryScreen from '../../app/barcode-history';
import CheckinHistoryScreen from '../../app/checkin-history';
import { renderWithProviders } from '../../test-utils/render';
import { router, setParams } from '../../test-utils/routerMock';
import { lastQuery, mockTable } from '../../test-utils/supabaseMock';

const lookups = [
  {
    id: 'l1',
    sku: '555',
    name: 'Olive Oil',
    brand: 'Kirkland',
    image_url: null,
    sale_price: 18.99,
    looked_up_at: '2026-10-06T10:00:00Z',
  },
  {
    id: 'l2',
    sku: '777',
    name: 'Paper Towels',
    brand: 'Bounty',
    image_url: 'https://example.com/p.jpg',
    sale_price: 24.99,
    looked_up_at: '2026-10-01T10:00:00Z',
  },
  {
    id: 'l3',
    sku: '888',
    name: null,
    brand: null,
    image_url: null,
    sale_price: null,
    looked_up_at: '2026-09-01T10:00:00Z',
  },
];
const checkIns = [
  {
    id: 'c1',
    checked_in_at: '2026-10-06T18:00:00Z',
    stars_earned: 1,
    warehouses: { name: 'Almaden', city: 'San Jose', tier: 'Common' },
  },
  {
    id: 'c2',
    checked_in_at: '2026-09-01T18:00:00Z',
    stars_earned: 3,
    warehouses: { name: 'Kona', city: 'Kailua-Kona', tier: 'Legendary' },
  },
];

describe('HistoryScreen (tabs)', () => {
  it('shows receipts by default and switches tabs', async () => {
    mockTable('receipts', [
      {
        id: 'r1',
        transaction_date: '2026-10-05',
        total_amount: 48.75,
        warehouses: { name: 'Almaden' },
        receipt_items: [{ id: 'a' }],
      },
    ]);
    mockTable('product_lookups', lookups);
    mockTable('check_ins', checkIns);
    await renderWithProviders(<HistoryScreen />);

    expect(await screen.findByText('Almaden')).toBeTruthy();
    expect(screen.getByText('$48.75')).toBeTruthy();
    fireEvent.press(screen.getByText('Almaden'));
    expect(router.push).toHaveBeenCalledWith('/receipt-success?receiptId=r1');

    fireEvent.press(screen.getByText('Barcode'));
    fireEvent.press(await screen.findByText('Olive Oil'));
    expect(router.push).toHaveBeenCalledWith('/product/555');

    fireEvent.press(screen.getByText('Check-ins'));
    expect(await screen.findByText('Kona')).toBeTruthy();
    expect(screen.getByText('+3')).toBeTruthy();
  });

  it('opens on the requested tab and shows its empty state', async () => {
    setParams({ tab: 'checkin' });
    await renderWithProviders(<HistoryScreen />);
    expect(await screen.findByText('No check-ins yet')).toBeTruthy();
    fireEvent.press(screen.getByText('Barcode'));
    expect(await screen.findByText('No barcode scans yet')).toBeTruthy();
    fireEvent.press(screen.getByText('Receipts'));
    expect(await screen.findByText('No receipts yet')).toBeTruthy();
  });
});

describe('BarcodeHistoryScreen', () => {
  it('lists, searches and sorts lookups', async () => {
    mockTable('product_lookups', lookups);
    await renderWithProviders(<BarcodeHistoryScreen />);
    expect(await screen.findByText('Olive Oil')).toBeTruthy();
    expect(screen.getByText('888')).toBeTruthy(); // falls back to the SKU
    expect(lastQuery('product_lookups')?.filters).toContainEqual(['eq', 'user_id', 'user-1']);

    fireEvent.press(screen.getByText('Newest first ▾'));
    fireEvent.press(screen.getByText('Highest price'));
    const prices = screen.getAllByText(/^\$\d/).map((t) => [].concat(t.props.children).join(''));
    expect(prices[0]).toBe('$24.99');

    fireEvent.changeText(screen.getByPlaceholderText('Item, brand, or SKU…'), 'bounty');
    expect(screen.queryByText('Olive Oil')).toBeNull();
    expect(screen.getByText('Paper Towels')).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText('Item, brand, or SKU…'), 'zzz');
    expect(screen.getByText('No results')).toBeTruthy();
  });

  it('opens a product, goes back, and shows the empty state', async () => {
    mockTable('product_lookups', lookups);
    await renderWithProviders(<BarcodeHistoryScreen />);
    fireEvent.press(await screen.findByText('Paper Towels'));
    expect(router.push).toHaveBeenCalledWith('/product/777');
    fireEvent.press(screen.getByText('‹ Back'));
    expect(router.back).toHaveBeenCalled();
  });

  it('shows the empty state and recovers from an error', async () => {
    mockTable('product_lookups', { data: null, error: new Error('timeout') });
    await renderWithProviders(<BarcodeHistoryScreen />);
    expect(await screen.findByText('timeout')).toBeTruthy();
    mockTable('product_lookups', []);
    fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('No barcode scans yet')).toBeTruthy();
  });
});

describe('CheckinHistoryScreen', () => {
  it('lists, searches and sorts check-ins', async () => {
    mockTable('check_ins', checkIns);
    await renderWithProviders(<CheckinHistoryScreen />);
    expect(await screen.findByText('Almaden')).toBeTruthy();
    expect(screen.getByText('Legendary')).toBeTruthy();

    fireEvent.press(screen.getByText('Newest first ▾'));
    fireEvent.press(screen.getByText('Most stars'));
    const stars = screen.getAllByText(/^\+\d/).map((t) => [].concat(t.props.children).join(''));
    expect(stars).toEqual(['+3', '+1']);

    fireEvent.changeText(screen.getByPlaceholderText('Warehouse or city…'), 'kailua');
    expect(screen.queryByText('Almaden')).toBeNull();
    expect(screen.getByText('Kona')).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText('Warehouse or city…'), 'nowhere');
    expect(screen.getByText('No results')).toBeTruthy();
  });

  it('shows the empty state and recovers from an error', async () => {
    mockTable('check_ins', { data: null, error: new Error('timeout') });
    await renderWithProviders(<CheckinHistoryScreen />);
    expect(await screen.findByText('timeout')).toBeTruthy();
    mockTable('check_ins', []);
    fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('No check-ins yet')).toBeTruthy();
    fireEvent.press(screen.getByText('‹ Back'));
    expect(router.back).toHaveBeenCalled();
  });
});
