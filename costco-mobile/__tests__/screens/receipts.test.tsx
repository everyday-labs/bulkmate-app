import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import ReceiptsScreen from '../../app/receipts';
import { renderWithProviders } from '../../test-utils/render';
import { router, setParams } from '../../test-utils/routerMock';
import { lastQuery, mockTable } from '../../test-utils/supabaseMock';

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const RECENT = daysAgo(5);
const OLD = daysAgo(800);
const MONTH = RECENT.slice(0, 7);

const rows = [
  {
    id: 'r1',
    transaction_date: RECENT,
    total_amount: 42.5,
    warehouses: { name: 'Almaden', warehouse_code: '470' },
    receipt_items: [{ id: 'a' }],
  },
  {
    id: 'r2',
    transaction_date: OLD,
    total_amount: 210,
    warehouses: { name: 'Coleman', warehouse_code: '1001' },
    receipt_items: [{ id: 'b' }, { id: 'c' }],
  },
  {
    id: 'r3',
    transaction_date: daysAgo(40),
    total_amount: null,
    warehouses: null,
    receipt_items: [],
  },
];

const visibleWarehouses = () =>
  ['Almaden', 'Coleman', 'Costco Warehouse'].filter((w) => screen.queryByText(w));

describe('ReceiptsScreen', () => {
  beforeEach(() => mockTable('receipts', rows));

  it('lists receipts newest first with totals, codes and item counts', async () => {
    await renderWithProviders(<ReceiptsScreen />);
    expect(await screen.findByText('Almaden')).toBeTruthy();
    expect(screen.getByText('#470')).toBeTruthy();
    expect(screen.getByText('$42.50')).toBeTruthy();
    expect(screen.getByText('1 item')).toBeTruthy();
    expect(screen.getByText('2 items')).toBeTruthy();
    expect(visibleWarehouses()).toEqual(['Almaden', 'Coleman', 'Costco Warehouse']);
    expect(lastQuery('receipts')?.filters).toContainEqual(['eq', 'user_id', 'user-1']);
  });

  it('opens a receipt', async () => {
    await renderWithProviders(<ReceiptsScreen />);
    fireEvent.press(await screen.findByText('Almaden'));
    expect(router.push).toHaveBeenCalledWith('/receipt-success?receiptId=r1');
  });

  it('sorts by total', async () => {
    await renderWithProviders(<ReceiptsScreen />);
    await screen.findByText('Almaden');
    fireEvent.press(screen.getByText('Newest first ▾'));
    fireEvent.press(screen.getByText('Highest total'));
    const totals = screen
      .getAllByText(/^\$\d/)
      .map((t) => t.props.children.join?.('') ?? t.props.children);
    expect(totals[0]).toContain('210.00');
    expect(screen.getByText('Highest total ▾')).toBeTruthy();
  });

  it('filters by warehouse and clears the filter', async () => {
    await renderWithProviders(<ReceiptsScreen />);
    await screen.findByText('Almaden');
    fireEvent.press(screen.getByText('All Warehouses ▾'));
    // The dropdown renders above the list, so its option is the first match.
    fireEvent.press(screen.getAllByText('Coleman')[0]);
    await waitFor(() => expect(screen.queryByText('#470')).toBeNull());
    expect(screen.getByText('#1001')).toBeTruthy();

    fireEvent.press(screen.getAllByText('✕')[0]);
    expect(await screen.findByText('#470')).toBeTruthy();
  });

  it('filters by date range and amount', async () => {
    await renderWithProviders(<ReceiptsScreen />);
    await screen.findByText('Almaden');

    fireEvent.press(screen.getByText('All Time ▾'));
    fireEvent.press(screen.getByText('Last 30 Days'));
    await waitFor(() => expect(screen.queryByText('#1001')).toBeNull());
    expect(screen.getByText('#470')).toBeTruthy();
    fireEvent.press(screen.getAllByText('✕')[0]);

    fireEvent.press(screen.getByText('Any Amount ▾'));
    fireEvent.press(screen.getByText('$150 – $300'));
    await waitFor(() => expect(screen.queryByText('#470')).toBeNull());
    expect(screen.getByText('#1001')).toBeTruthy();
  });

  it('opens pre-filtered to a month from analytics', async () => {
    setParams({ month: MONTH, label: 'This month' });
    await renderWithProviders(<ReceiptsScreen />);
    expect(await screen.findByText('This month')).toBeTruthy();
    expect(screen.getByText('#470')).toBeTruthy();
    expect(screen.queryByText('#1001')).toBeNull();
  });

  it('searches item descriptions, SKUs and warehouses', async () => {
    mockTable('receipt_items', [{ receipt_id: 'r2' }]);
    await renderWithProviders(<ReceiptsScreen />);
    await screen.findByText('Almaden');

    fireEvent.changeText(screen.getByPlaceholderText('Item, SKU, or warehouse…'), 'olive');
    await waitFor(() => expect(screen.queryByText('#470')).toBeNull(), { timeout: 2000 });
    expect(screen.getByText('#1001')).toBeTruthy();
    expect(lastQuery('receipt_items')?.filters).toContainEqual([
      'or',
      'description.ilike.%olive%,sku.ilike.%olive%',
    ]);

    // Matching on the warehouse name works without any item hit.
    mockTable('receipt_items', []);
    fireEvent.changeText(screen.getByPlaceholderText('Item, SKU, or warehouse…'), 'almaden');
    await waitFor(() => expect(screen.getByText('#470')).toBeTruthy(), { timeout: 2000 });
    expect(screen.queryByText('#1001')).toBeNull();
  });

  it('shows the empty state', async () => {
    mockTable('receipts', []);
    await renderWithProviders(<ReceiptsScreen />);
    expect(await screen.findByText('No receipts yet')).toBeTruthy();
  });

  it('shows an error with retry', async () => {
    mockTable('receipts', { data: null, error: new Error('network down') });
    await renderWithProviders(<ReceiptsScreen />);
    expect(await screen.findByText('network down')).toBeTruthy();
    mockTable('receipts', rows);
    fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Almaden')).toBeTruthy();
  });

  it('goes back', async () => {
    await renderWithProviders(<ReceiptsScreen />);
    fireEvent.press(await screen.findByText('‹ Back'));
    expect(router.back).toHaveBeenCalled();
  });
});
