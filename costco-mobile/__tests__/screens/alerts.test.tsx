import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import AlertsScreen from '../../app/alerts';
import { posthog } from '../../lib/posthog';
import { renderWithProviders } from '../../test-utils/render';
import { router } from '../../test-utils/routerMock';
import { lastQuery, mockTable } from '../../test-utils/supabaseMock';

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const alert = (id: string, description: string, delta: number, extra: object = {}) => ({
  id,
  sku: `sku-${id}`,
  paid_price: '12.99',
  current_price: String(12.99 - delta),
  delta: String(delta),
  dismissed_at: null,
  receipt_items: { description, receipt_id: `r-${id}`, transaction_date: daysAgo(10) },
  ...extra,
});

describe('AlertsScreen', () => {
  it('totals what is owed and groups the same item across receipts', async () => {
    mockTable('price_alerts', [
      alert('a1', 'KS COCONUT WATER', 3),
      alert('a2', 'KS COCONUT WATER', 2, {
        receipt_items: {
          description: 'KS COCONUT WATER',
          receipt_id: 'r-a2',
          transaction_date: daysAgo(29),
        },
      }),
      alert('a3', 'OLIVE OIL', 1.5, { dismissed_at: '2026-10-01T00:00:00Z' }),
    ]);
    await renderWithProviders(<AlertsScreen />);

    expect(await screen.findByText('$5.00')).toBeTruthy(); // active only
    expect(screen.getAllByText('KS COCONUT WATER')).toHaveLength(1);
    expect(screen.getByText('+$5.00')).toBeTruthy(); // grouped refund
    expect(screen.getByText('20 days left to claim')).toBeTruthy();
    expect(screen.getByText('1 day left to claim')).toBeTruthy();
    expect(screen.getByText('CLAIMED')).toBeTruthy();
    expect(screen.getByText('OLIVE OIL')).toBeTruthy();
  });

  it('marks an alert as claimed', async () => {
    mockTable('price_alerts', (q) =>
      q.op === 'update'
        ? { data: null, error: null }
        : { data: [alert('a1', 'KS COCONUT WATER', 3)], error: null },
    );
    await renderWithProviders(<AlertsScreen />);
    fireEvent.press(await screen.findByText('Mark as claimed'));

    expect(await screen.findByText('CLAIMED')).toBeTruthy();
    expect(screen.getByText('$0.00')).toBeTruthy();
    await waitFor(() => expect(posthog!.capture).toHaveBeenCalledWith('price_alert_claimed'));
    expect(lastQuery('price_alerts')?.filters).toContainEqual(['eq', 'id', 'a1']);
  });

  it('opens the receipt for an alert', async () => {
    mockTable('price_alerts', [alert('a1', 'KS COCONUT WATER', 3)]);
    await renderWithProviders(<AlertsScreen />);
    fireEvent.press(await screen.findByText('🧾 View Receipt'));
    expect(router.push).toHaveBeenCalledWith('/receipt-success?receiptId=r-a1');
  });

  it('shows the empty state and goes back', async () => {
    await renderWithProviders(<AlertsScreen />);
    expect(await screen.findByText('No price drops yet')).toBeTruthy();
    fireEvent.press(screen.getByText('‹ Back'));
    expect(router.back).toHaveBeenCalled();
  });

  it('says when the claim window is closing', async () => {
    mockTable('price_alerts', [
      alert('a1', 'KS COCONUT WATER', 3, {
        receipt_items: {
          description: 'KS COCONUT WATER',
          receipt_id: 'r-a1',
          transaction_date: daysAgo(45),
        },
      }),
    ]);
    await renderWithProviders(<AlertsScreen />);
    expect(await screen.findByText('Claim window closing')).toBeTruthy();
  });
});
