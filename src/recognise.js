// Photo recognition: asks Claude what item of clothing is in an uploaded photo.
// The photo is sent to Anthropic for this one request and is not stored by us.
import { config } from './config.js';
import { CATEGORIES, COLOURS } from './classify.js';

export const PROMPT = `You are the clothing recogniser for a UK menswear shopping site. The image should show one item of clothing or footwear the user owns.
Reply with only a JSON object with these keys:
"isClothing" (boolean);
"category" (exactly one of ${CATEGORIES.map((c) => `"${c}"`).join(', ')}: blazers, coats, suit jackets, leather and denim jackets are Jacket; shirts and overshirts are Shirt; polos are T-shirt; knitwear, sweatshirts and hoodies are Jumper; jeans and chinos are Trousers; trainers, boots and loafers are Shoes);
"colour" (the closest of ${COLOURS.map((c) => `"${c}"`).join(', ')});
"name" (a short shop-style name, 2 to 5 words, lowercase except proper nouns, e.g. "navy Oxford shirt");
"details" (an array of up to 4 short visible details, e.g. "button-down collar", "slim fit").
If several items are visible, describe the most prominent one. If there is no clothing, set isClothing to false and leave the other fields empty.`;

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function parseDataUrl(dataUrl) {
  const m = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || ''));
  if (!m) return null;
  const mediaType = m[1].toLowerCase();
  if (!ALLOWED.has(mediaType)) return null;
  const data = m[2].replace(/\s/g, '');
  return { mediaType, data, bytes: Math.floor((data.length * 3) / 4) };
}

export function cleanResult(raw) {
  const text = String(raw || '');
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  let o;
  try { o = JSON.parse(json); } catch { return null; }
  if (o.isClothing === false) return { isClothing: false };
  return {
    isClothing: true,
    category: CATEGORIES.includes(o.category) ? o.category : null,
    colour: COLOURS.includes(o.colour) ? o.colour : null,
    name: String(o.name || '').slice(0, 60),
    details: Array.isArray(o.details) ? o.details.slice(0, 4).map((d) => String(d).slice(0, 40)) : [],
  };
}

export async function recognise(dataUrl, fetchImpl = fetch) {
  if (!config.anthropicApiKey) return { status: 503, body: { error: 'not_configured', message: 'Photo reading is switched off on this site.' } };
  const img = parseDataUrl(dataUrl);
  if (!img) return { status: 400, body: { error: 'bad_image', message: 'Upload a JPEG, PNG, WebP or GIF photo.' } };
  if (img.bytes > 5 * 1024 * 1024) return { status: 413, body: { error: 'too_large', message: 'That photo is over 5MB. Try a smaller one.' } };

  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': config.anthropicApiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: 300,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
        { type: 'text', text: PROMPT },
      ] }],
    }),
  });
  if (!res.ok) {
    const status = res.status === 429 ? 429 : 502;
    return { status, body: { error: status === 429 ? 'busy' : 'upstream', message: status === 429 ? 'Too many photos just now. Try again in a minute.' : 'We couldn’t read that photo. Pick the type and colour yourself.' } };
  }
  const data = await res.json();
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  const result = cleanResult(text);
  if (!result) return { status: 502, body: { error: 'unreadable', message: 'We couldn’t read that photo. Pick the type and colour yourself.' } };
  return { status: 200, body: result };
}
