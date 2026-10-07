// Google Cloud Vision — OCR for receipt images. Used only by ingest-receipt,
// the very first step of the receipt-scan pipeline (image → raw text →
// parser.ts). See ../../../EXTERNAL_APIS.md for auth and cost.
//
// Unlike the other three external clients in this directory, this one
// throws on failure rather than returning null. That's intentional: OCR
// isn't an enrichment step, it's the entire input to the rest of the
// pipeline — there's nothing meaningful to fall back to if we can't read
// the receipt, so the caller (ingest-receipt/index.ts) lets the error
// propagate to its top-level catch and returns a clean error response,
// prompting the user to retry the scan.

const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

// Normal OCR takes 1-5s. Past this, fail with a retryable error instead of
// holding ingest-receipt open until the gateway's 150s timeout.
const TIMEOUT_MS = 30_000;

export async function extractTextFromImage(base64Image: string): Promise<string> {
  const apiKey = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');
  if (!apiKey) throw new Error('GOOGLE_CLOUD_VISION_API_KEY not set');

  const response = await fetch(`${VISION_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          image: { content: base64Image },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Vision API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  const text = data.responses?.[0]?.fullTextAnnotation?.text;
  if (!text) throw new Error('No text detected in image');

  return text;
}
