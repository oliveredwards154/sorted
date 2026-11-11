// Feeds from other networks (Rakuten, CJ, Webgains, Impact, a brand's own Shopify export...).
// Each one names its columns differently, so you describe the columns once in data/feeds.json.
// Example entry:
// {
//   "name": "Webgains – Albam",
//   "network": "Webgains",
//   "urlEnv": "WEBGAINS_FEED_ALBAM",          // env var holding the download URL (keeps keys out of git)
//   "delimiter": ",",
//   "advertiserId": "276085",
//   "columns": { "productId": "product_id", "name": "product_name", "url": "merchant_url",
//                "affiliateUrl": "deeplink", "price": "price", "image": "image_url",
//                "category": "category", "colour": "colour", "merchantName": "program_name", "inStock": "in_stock" }
// }
import { parseCsv } from './csv.js';

export function* readGenericCsv(text, source) {
  const cols = source.columns || {};
  const get = (row, key) => (cols[key] ? row[cols[key]] ?? '' : '');
  for (const row of parseCsv(text, { delimiter: source.delimiter || ',' })) {
    const stock = String(get(row, 'inStock') || '1').toLowerCase();
    yield {
      network: source.network,
      advertiserId: get(row, 'advertiserId') || source.advertiserId || '',
      merchantName: get(row, 'merchantName') || source.merchantName || '',
      productId: get(row, 'productId'),
      name: get(row, 'name'),
      url: get(row, 'url'),
      affiliateUrl: get(row, 'affiliateUrl'),
      price: get(row, 'price'),
      currency: get(row, 'currency') || 'GBP',
      image: get(row, 'image'),
      category: get(row, 'category'),
      colour: get(row, 'colour'),
      brandName: get(row, 'brandName'),
      gender: get(row, 'gender'),
      inStock: !['0', 'false', 'no', 'out of stock'].includes(stock),
    };
  }
}
