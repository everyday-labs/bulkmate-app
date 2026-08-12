import { File } from 'expo-file-system/next';
import { supabase } from './supabase';
import { getQueue, removeFromQueue } from './offlineQueue';

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png'];

export type UploadReceiptResult = {
  receiptId: string;
  itemCount: number;
  subtotal: number | null;
  itemCountMismatch: boolean;
  duplicate: boolean;
};

export async function uploadReceipt(imageUri: string): Promise<UploadReceiptResult> {
  const ext = imageUri.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error('Only JPEG and PNG images are supported.');
  }

  const fileName = `${Date.now()}.${ext}`;
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const filePath = `${session.user.id}/${fileName}`;

  // Read file bytes — Blob from ArrayBuffer not supported on RN, pass Uint8Array directly
  const bytes = await new File(imageUri).bytes();

  const { error: storageError } = await supabase.storage
    .from('receipts')
    .upload(filePath, bytes, { contentType });

  if (storageError) throw storageError;

  // The image is uploaded before the receipt row exists, so any path that
  // doesn't end in a row owning this file has to delete it again — otherwise
  // it is orphaned in Storage forever, invisible in the app and not covered by
  // "delete this receipt". These are full receipt photos, which on a Costco
  // receipt include the membership number, so leaving them behind is a privacy
  // problem, not just wasted space.
  const discardUpload = async () => {
    const { error } = await supabase.storage.from('receipts').remove([filePath]);
    if (error) console.warn('Could not remove orphaned receipt upload:', error.message);
  };

  let data;
  try {
    const { data: fnData, error: fnError } = await supabase.functions.invoke('ingest-receipt', {
      body: { imagePath: filePath, userId: session.user.id },
    });
    if (fnError) throw fnError;
    if (!fnData?.receiptId) throw new Error('No receipt ID returned from server');
    data = fnData;
  } catch (err) {
    await discardUpload();
    throw err;
  }

  // A duplicate returns the *existing* receipt, which already has its own
  // image. The one just uploaded is referenced by nothing.
  if (data.duplicate) await discardUpload();

  return {
    receiptId: data.receiptId,
    itemCount: data.itemCount ?? 0,
    subtotal: data.subtotal ?? null,
    itemCountMismatch: data.itemCountMismatch ?? false,
    duplicate: data.duplicate ?? false,
  };
}

export async function drainQueue(): Promise<void> {
  const queue = await getQueue();
  for (const item of queue) {
    try {
      await uploadReceipt(item.imageUri);
      await removeFromQueue(item.id);
    } catch {
      // leave failed items in queue for next drain
    }
  }
}
