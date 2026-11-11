// Turns a row from any network's product feed into one Sorted product.
import { detectCategory, detectColour, tierFromPrice, slotFor, tagOccasions } from '../classify.js';

const norm = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

export function makeBrandMatcher(brands) {
  const byAdvertiser = new Map();
  const byName = new Map();
  for (const b of brands) {
    const a = b.affiliate || {};
    if (a.advertiserId) byAdvertiser.set(`${a.network}:${a.advertiserId}`, b);
    byName.set(norm(b.name), b);
    byName.set(norm(b.name.replace(/\b(men|man|london|clothing|uk)\b/gi, '')), b);
  }
  return ({ network, advertiserId, merchantName }) =>
    (advertiserId && byAdvertiser.get(`${network}:${advertiserId}`)) ||
    byName.get(norm(merchantName)) ||
    byName.get(norm(String(merchantName || '').replace(/\b(men|man|london|clothing|uk|gb)\b/gi, ''))) ||
    null;
}

const MENSWEAR = /\b(men|mens|men's|man|male|gents?|unisex)\b/i;
const WOMENSWEAR = /\b(women|womens|women's|ladies|girls?|maternity|bra|dress|skirt|blouse|heels?)\b/i;

/**
 * @param {object} f  fields already pulled out of the feed row (see feeds/awin.js for an example)
 * @returns {object|null} a product, or null if it isn't menswear we can use
 */
export function normaliseProduct(f, matchBrand) {
  const name = String(f.name || '').trim();
  const url = String(f.url || '').trim();
  if (!name || !/^https?:\/\//.test(url)) return null;

  const context = `${f.category || ''} ${f.gender || ''}`;
  if (WOMENSWEAR.test(`${name} ${context}`) && !MENSWEAR.test(`${name} ${context}`)) return null;

  const category = detectCategory(name, f.category, f.keywords);
  if (!category) return null;

  const price = Number(String(f.price || '').replace(/[^0-9.]/g, ''));
  const brand = matchBrand ? matchBrand({ network: f.network, advertiserId: f.advertiserId, merchantName: f.merchantName }) : null;

  return {
    id: `${(f.network || 'feed').toLowerCase()}-${f.advertiserId || norm(f.merchantName)}-${f.productId || norm(name).slice(0, 40)}`,
    name,
    category,
    slot: slotFor(category),
    colour: detectColour(f.colour, name),
    keywords: [f.category, f.colour, f.brandName].filter(Boolean).join(' '),
    price: isFinite(price) && price > 0 ? price : null,
    currency: f.currency || 'GBP',
    tier: tierFromPrice(price),
    image: f.image || null,
    url,                                   // the shop's own product page
    affiliateUrl: f.affiliateUrl || null,  // a ready-made tracked link, when the feed provides one
    brandId: brand ? brand.id : null,
    brandName: brand ? brand.name : (f.brandName || f.merchantName || null),
    network: f.network || null,
    inStock: f.inStock !== false,
    occasions: tagOccasions(name, f.category),
  };
}
