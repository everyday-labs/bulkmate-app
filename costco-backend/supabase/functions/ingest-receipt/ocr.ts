const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

export async function extractTextFromImage(base64Image: string): Promise<string> {
  const apiKey = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');
  if (!apiKey) throw new Error('GOOGLE_CLOUD_VISION_API_KEY not set');

  const response = await fetch(`${VISION_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        image: { content: base64Image },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
      }],
    }),
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
