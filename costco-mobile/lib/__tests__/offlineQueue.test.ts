import AsyncStorage from '@react-native-async-storage/async-storage';
import { enqueue, getQueue, removeFromQueue } from '../offlineQueue';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('offline receipt queue', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('starts empty', async () => {
    expect(await getQueue()).toEqual([]);
  });

  it('enqueues receipts in order and survives a re-read', async () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValueOnce(1000).mockReturnValueOnce(2000);
    await enqueue('file:///a.jpg');
    await enqueue('file:///b.jpg');
    now.mockRestore();

    const queue = await getQueue();
    expect(queue.map((q) => [q.id, q.imageUri])).toEqual([
      ['1000', 'file:///a.jpg'],
      ['2000', 'file:///b.jpg'],
    ]);
    expect(Number.isNaN(Date.parse(queue[0].queuedAt))).toBe(false);
  });

  it('removes only the matching receipt', async () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValueOnce(1000).mockReturnValueOnce(2000);
    await enqueue('file:///a.jpg');
    await enqueue('file:///b.jpg');
    now.mockRestore();

    await removeFromQueue('1000');
    expect((await getQueue()).map((q) => q.imageUri)).toEqual(['file:///b.jpg']);

    await removeFromQueue('does-not-exist');
    expect(await getQueue()).toHaveLength(1);
  });
});
