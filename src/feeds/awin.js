// Awin product feeds.
//
// In Awin: Toolbox > Create-a-Feed. Pick the brands you're approved for, choose CSV,
// and include at least these columns:
//   aw_product_id, product_name, merchant_id, merchant_name, aw_deep_link, merchant_deep_link,
//   search_price, currency, aw_image_url (or merchant_image_url), merchant_category,
//   category_name, colour, in_stock, brand_name
// Awin gives you a download URL with your API key in it. Put that URL in AWIN_FEED_URLS
// (space-separated if you have several). Treat it like a password: it's in .env, never in git.
import { gunzipSync } from 'node:zlib';
import { parseCsv } from './csv.js';

export function mapAwinRow(r) {
  const inStock = String(r.in_stock ?? r.stock_status ?? '1').toLowerCase();
  return {
    network: 'Awin',
    advertiserId: r.merchant_id || '',
    merchantName: r.merchant_name || '',
    productId: r.aw_product_id || r.merchant_product_id || '',
    name: r.product_name || '',
    url: r.merchant_deep_link || '',
    affiliateUrl: r.aw_deep_link || '',
    price: r.search_price || r.store_price || r.display_price || '',
    currency: r.currency || 'GBP',
    image: r.aw_image_url || r.merchant_image_url || r.large_image || '',
    category: [r.merchant_category, r.category_name].filter(Boolean).join(' '),
    colour: r.colour || '',
    brandName: r.brand_name || '',
    gender: r.gender || r['Fashion:suitable_for'] || '',
    keywords: r.keywords || '',
    inStock: !['0', 'false', 'no', 'out of stock'].includes(inStock),
  };
}

export async function downloadFeed(url, fetchImpl = fetch) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Feed download failed (${res.status}) for ${url.replace(/apikey\/[^/]+/i, 'apikey/***')}`);
  let buf = Buffer.from(await res.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
  return buf.toString('utf8');
}

export function* readAwinCsv(text) {
  for (const row of parseCsv(text)) yield mapAwinRow(row);
}
