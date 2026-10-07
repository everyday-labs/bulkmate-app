// Expo Push API — delivers push notifications to devices registered via
// expo-notifications on the client. Free, no API key (Expo's push service is
// authenticated by each device's push token, not a server-side credential).
// Used only by price-match-check, to notify users when a price-drop alert
// is created.
//
// See ../../../EXTERNAL_APIS.md for details.

// Per 100-message batch; a stuck batch is skipped, not retried.
const TIMEOUT_MS = 15_000;

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: 'default';
  channelId?: string;
};

/**
 * Sends push notifications in batches of up to 100 (Expo's per-request
 * limit).
 *
 * Never throws. Each batch is sent independently and a failed batch is
 * logged and skipped rather than aborting the rest — push delivery is a
 * side effect of price-match-check's real work (writing price_alerts rows),
 * so a push failure must never roll back or fail that work.
 */
export async function sendExpoPushNotifications(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  const chunks: ExpoPushMessage[][] = [];
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        console.warn('Expo Push API error:', res.status, await res.text());
      } else {
        const result = await res.json();
        console.log(
          `Expo push sent ${chunk.length} messages:`,
          JSON.stringify(result?.data?.slice(0, 3)),
        );
      }
    } catch (err) {
      console.warn('Expo push fetch failed:', err);
    }
  }
}
