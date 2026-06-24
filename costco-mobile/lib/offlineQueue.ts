import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'receipt_upload_queue';

export type QueuedReceipt = {
  id: string;
  imageUri: string;
  queuedAt: string;
};

export async function enqueue(imageUri: string): Promise<void> {
  const existing = await getQueue();
  const item: QueuedReceipt = {
    id: Date.now().toString(),
    imageUri,
    queuedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([...existing, item]));
}

export async function getQueue(): Promise<QueuedReceipt[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function removeFromQueue(id: string): Promise<void> {
  const existing = await getQueue();
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(existing.filter(i => i.id !== id)));
}
