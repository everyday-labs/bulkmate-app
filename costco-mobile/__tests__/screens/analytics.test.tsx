import { fireEvent, screen } from '@testing-library/react-native';
import AnalyticsScreen from '../../app/(tabs)/analytics';
import { renderWithProviders } from '../../test-utils/render';
import { router } from '../../test-utils/routerMock';
import { mockTable } from '../../test-utils/supabaseMock';

// Same local-time month key the screen builds.
const now = new Date();
const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

function seed() {
  mockTable('receipts', [
    { id: 'r1', transaction_date: `${thisMonth}-02`, total_amount: 1200 },
    { id: 'r2', transaction_date: `${thisMonth}-03`, total_amount: 300 },
    { id: 'r3', transaction_date: '2019-01-01', total_amount: 100 }, // outside the 6-month chart
  ]);
  mockTable('receipt_items', [
    { description: 'TV', unit_price: 899.99, quantity: 1, discount_amount: 100 },
    { description: 'KS WATER', unit_price: 4.99, quantity: 3, discount_amount: null },
    { description: 'KS WATER', unit_price: 4.99, quantity: 1, discount_amount: 1 },
  ]);
  mockTable('price_alerts', [{ delta: '3.50' }, { delta: '1.50' }]);
  mockTable('check_ins', [{ id: 'c1' }, { id: 'c2' }]);
}

describe('AnalyticsScreen', () => {
  it('computes totals, savings and top items', async () => {
    seed();
    await renderWithProviders(<AnalyticsScreen />);

    expect(await screen.findByText('$1600.00')).toBeTruthy(); // total spent
    expect(screen.getByText('$101.00')).toBeTruthy(); // in-store discounts
    expect(screen.getByText('$5.00')).toBeTruthy(); // price-match refunds
    expect(screen.getByText('$533.33')).toBeTruthy(); // average basket
    expect(screen.getByText('TV')).toBeTruthy();
    expect(screen.getByText('$19.96')).toBeTruthy(); // 4 × 4.99, grouped by description
    expect(screen.getByText('$1.5k')).toBeTruthy(); // this month's bar label
  });

  it('opens the receipts for a month from its bar', async () => {
    seed();
    await renderWithProviders(<AnalyticsScreen />);
    fireEvent.press(await screen.findByText('$1.5k'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/receipts',
      params: { month: thisMonth, label: expect.any(String) },
    });
  });

  it('shows the empty state with no receipts', async () => {
    await renderWithProviders(<AnalyticsScreen />);
    expect(await screen.findByText('No data yet')).toBeTruthy();
  });
});
