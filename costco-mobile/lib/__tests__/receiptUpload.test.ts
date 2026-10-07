import AsyncStorage from '@react-native-async-storage/async-storage';
import { drainQueue, uploadReceipt } from '../receiptUpload';
import { enqueue, getQueue } from '../offlineQueue';
import { mockFunction, queriesFor, signedOut, supabaseMock } from '../../test-utils/supabaseMock';

const storage = () => supabaseMock.storage.from.mock.results.map((r) => r.value);

describe('uploadReceipt', () => {
  beforeEach(() => AsyncStorage.clear());

  it('rejects non-image files', async () => {
    await expect(uploadReceipt('file:///receipt.heic')).rejects.toThrow('Only JPEG and PNG');
  });

  it('requires a session', async () => {
    signedOut();
    await expect(uploadReceipt('file:///r.jpg')).rejects.toThrow('Not authenticated');
  });

  it('uploads under the user folder and calls ingest-receipt', async () => {
    mockFunction('ingest-receipt', {
      data: { receiptId: 'r1', itemCount: 5, subtotal: 48.75, itemCountMismatch: false },
      error: null,
    });
    const result = await uploadReceipt('file:///photo.PNG');

    expect(result).toEqual({
      receiptId: 'r1',
      itemCount: 5,
      subtotal: 48.75,
      itemCountMismatch: false,
      duplicate: false,
    });
    const upload = storage()[0].upload as jest.Mock;
    const [path, , opts] = upload.mock.calls[0];
    expect(path).toMatch(/^user-1\/\d+\.png$/);
    expect(opts).toEqual({ contentType: 'image/png' });
    expect(queriesFor('fn:ingest-receipt')[0].payload).toEqual({
      imagePath: path,
      userId: 'user-1',
    });
  });

  it('defaults missing counts from the server', async () => {
    mockFunction('ingest-receipt', { data: { receiptId: 'r1' }, error: null });
    expect(await uploadReceipt('file:///r.jpg')).toEqual({
      receiptId: 'r1',
      itemCount: 0,
      subtotal: null,
      itemCountMismatch: false,
      duplicate: false,
    });
  });

  it('removes the orphaned upload when ingestion fails', async () => {
    mockFunction('ingest-receipt', { data: null, error: new Error('OCR failed') });
    await expect(uploadReceipt('file:///r.jpg')).rejects.toThrow('OCR failed');
    const remove = storage().find((s) => (s.remove as jest.Mock).mock.calls.length)
      ?.remove as jest.Mock;
    expect(remove.mock.calls[0][0][0]).toMatch(/^user-1\/\d+\.jpg$/);
  });

  it('removes the new upload for a duplicate receipt', async () => {
    mockFunction('ingest-receipt', {
      data: { receiptId: 'existing', duplicate: true },
      error: null,
    });
    const result = await uploadReceipt('file:///r.jpeg');
    expect(result.duplicate).toBe(true);
    expect(storage().some((s) => (s.remove as jest.Mock).mock.calls.length > 0)).toBe(true);
  });

  it('fails when the server returns no receipt id', async () => {
    mockFunction('ingest-receipt', { data: {}, error: null });
    await expect(uploadReceipt('file:///r.jpg')).rejects.toThrow('No receipt ID');
  });

  it('surfaces storage errors without calling the function', async () => {
    supabaseMock.storage.from.mockReturnValueOnce({
      upload: jest.fn(() => Promise.resolve({ data: null, error: new Error('quota') })),
    } as never);
    await expect(uploadReceipt('file:///r.jpg')).rejects.toThrow('quota');
    expect(queriesFor('fn:ingest-receipt')).toHaveLength(0);
  });
});

describe('drainQueue', () => {
  beforeEach(() => AsyncStorage.clear());

  it('uploads queued receipts and keeps the ones that fail', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1).mockReturnValueOnce(2);
    await enqueue('file:///ok.jpg');
    await enqueue('file:///bad.gif');
    jest.restoreAllMocks();

    mockFunction('ingest-receipt', { data: { receiptId: 'r1' }, error: null });
    await drainQueue();
    expect((await getQueue()).map((q) => q.imageUri)).toEqual(['file:///bad.gif']);
  });
});
