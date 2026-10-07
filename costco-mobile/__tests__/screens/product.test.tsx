import { Linking } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import ProductDetailScreen from '../../app/product/[sku]';
import { renderWithProviders } from '../../test-utils/render';
import { router, setParams } from '../../test-utils/routerMock';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;
const respond = (status: number, body: object) =>
  fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: () => Promise.resolve(body) });

const product = {
  sku: '1061247',
  name: 'Kirkland Parmigiano Reggiano',
  brand: 'Kirkland Signature',
  image_url: 'https://example.com/p.jpg',
  pdp_url: 'https://www.costco.com/p.html',
  rating: 4.7,
  total_reviews: 812,
  sale_price: 12.99,
  list_price: 15.99,
  online_price: 16.49,
  savings_amount: 3,
  in_warehouse: true,
  ocr_history: {
    count: 3,
    min_price: 11.99,
    max_price: 13.49,
    avg_price: 12.66,
    last_seen: '2026-10-01',
  },
  ingredients: {
    text: 'Milk, salt, rennet, sodium nitrite',
    items: [
      { name: 'Milk', flag: 'good', reason: null },
      { name: 'salt', flag: 'good', reason: null },
      { name: 'sodium nitrite', flag: 'avoid', reason: 'Preservative' },
    ],
    productFlags: [
      { key: 'nova-4', label: 'Ultra-Processed (NOVA 4)', flag: 'watch', reason: 'r' },
    ],
    tally: { good: 2, watch: 0, avoid: 1 },
    novaGroup: 4,
    nutriscoreGrade: 'd',
    source: 'off',
  },
  source: 'rapidapi',
};

describe('ProductDetailScreen', () => {
  beforeEach(() => setParams({ sku: '1061247' }));

  it('looks the SKU up and shows pricing, history and ingredients', async () => {
    respond(200, product);
    await renderWithProviders(<ProductDetailScreen />);

    expect(await screen.findByText('Kirkland Parmigiano Reggiano')).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://test.supabase.co/functions/v1/barcode-lookup');
    expect(JSON.parse(init.body)).toEqual({ sku: '1061247' });
    expect(init.headers.Authorization).toBe('Bearer access-token');

    expect(screen.getByText('$12.99')).toBeTruthy();
    expect(screen.getByText('$15.99')).toBeTruthy();
    expect(screen.getByText('$16.49')).toBeTruthy();
    expect(screen.getByText('4.7')).toBeTruthy();
    expect(screen.getByText('In warehouse')).toBeTruthy();
    expect(screen.getByText('$11.99')).toBeTruthy(); // lowest in-store price
    expect(screen.getByText('NOVA 4')).toBeTruthy();
    expect(screen.getByText('D')).toBeTruthy(); // Nutri-Score letter
    expect(screen.getByText('Ultra-Processed (NOVA 4)')).toBeTruthy();
    expect(screen.getByText('Item #1061247')).toBeTruthy();
  });

  it('opens the product on Costco.com', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    respond(200, product);
    await renderWithProviders(<ProductDetailScreen />);
    fireEvent.press(await screen.findByText('View on Costco.com'));
    expect(openURL).toHaveBeenCalledWith('https://www.costco.com/p.html');
  });

  it('renders a sparse product without prices, history or ingredients', async () => {
    respond(200, {
      ...product,
      brand: null,
      image_url: null,
      pdp_url: null,
      rating: null,
      sale_price: null,
      list_price: null,
      online_price: null,
      savings_amount: null,
      in_warehouse: false,
      ocr_history: { count: 0, min_price: null, max_price: null, avg_price: null, last_seen: null },
      ingredients: {
        text: null,
        items: [],
        productFlags: [],
        tally: { good: 0, watch: 0, avoid: 0 },
        novaGroup: null,
        nutriscoreGrade: null,
        source: 'none',
      },
      source: 'partial',
    });
    await renderWithProviders(<ProductDetailScreen />);
    expect(await screen.findByText('Kirkland Parmigiano Reggiano')).toBeTruthy();
    expect(screen.queryByText('View on Costco.com')).toBeNull();
    expect(screen.queryByText('INGREDIENTS')).toBeNull();
  });

  it('shows not-found with a way back', async () => {
    respond(404, { error: 'Product not found' });
    await renderWithProviders(<ProductDetailScreen />);
    expect(await screen.findByText('Product Not Found')).toBeTruthy();
    expect(screen.getByText('Product not found')).toBeTruthy();
    fireEvent.press(screen.getByText('Go Back'));
    expect(router.back).toHaveBeenCalled();
  });

  it('handles a network failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network request failed'));
    await renderWithProviders(<ProductDetailScreen />);
    expect(await screen.findByText('Network request failed')).toBeTruthy();
  });
});
