// The product catalogue: real products from partner feeds when data/catalogue.json exists
// (made by `npm run feeds:sync`), otherwise a small preview set of example items.
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { ROOT, config } from './config.js';
import { tierFromPrice, slotFor } from './classify.js';

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

export const occasions = readJson(path.join(ROOT, 'data', 'occasions.json'));
export const brands = readJson(path.join(ROOT, 'data', 'brands.json'));
export const brandById = new Map(brands.map((b) => [b.id, b]));

let cache = { mtime: 0, products: [], source: 'preview' };

// Example items are not real listings: they have no brand or price, and are only there so the
// site works end to end before any feed is connected.
function loadPreview() {
  const items = readJson(path.join(ROOT, 'data', 'sample-products.json'));
  return items.map((p) => ({
    id: p.id, name: p.name, category: p.category, colour: p.colour, keywords: p.keywords || '',
    image: p.image, price: null, tier: null, brandId: null, url: null, inStock: true,
    slot: slotFor(p.category), occasions: [], preview: true,
  }));
}

export function loadCatalogue() {
  const file = config.catalogueFile;
  if (existsSync(file)) {
    const mtime = statSync(file).mtimeMs;
    if (mtime !== cache.mtime) {
      const data = readJson(file);
      const products = (data.products || []).filter((p) => p && p.id && p.name && p.category && p.url);
      cache = { mtime, products, source: 'feeds', updatedAt: data.updatedAt || null };
    }
    if (cache.products.length) return cache;
  }
  if (cache.source !== 'preview' || !cache.products.length) cache = { mtime: 0, products: loadPreview(), source: 'preview' };
  return cache;
}

const WORD = /[a-z][a-z\-]{2,}/g;
function words(text) { return new Set((String(text || '').toLowerCase().match(WORD) || [])); }

// Scores how well a product matches what the person is looking for.
// "Light grey trousers" should rank grey trousers above jeans, so words count more than colour.
export function scoreProduct(product, query) {
  const want = words(query.text);
  const have = words(`${product.name} ${product.keywords || ''}`);
  let score = 0;
  for (const w of want) {
    if (have.has(w)) score += 3;
    else for (const h of have) { if (h.length > 3 && (h.startsWith(w) || w.startsWith(h))) { score += 2; break; } }
  }
  if (query.colour && product.colour === query.colour) score += 2;
  if (query.occasion && (product.occasions || []).includes(query.occasion)) score += 1;
  if (product.inStock === false) score -= 5;
  return score;
}

/**
 * @param {{category:string, text?:string, colour?:string, occasion?:string, tier?:string, limit?:number}} query
 */
export function search(query) {
  const { products, source } = loadCatalogue();
  const limit = Math.min(Math.max(Number(query.limit) || 12, 1), 48);
  let list = products.filter((p) => p.category === query.category);
  if (query.tier && source === 'feeds') list = list.filter((p) => (p.tier || tierFromPrice(p.price)) === query.tier);
  const ranked = list
    .map((p, i) => ({ p, i, s: scoreProduct(p, query) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map(({ p, s }) => ({ ...publicProduct(p), score: s }));
  return { source, results: ranked };
}

export function getProduct(id) {
  return loadCatalogue().products.find((p) => p.id === id) || null;
}

export function publicProduct(p) {
  const brand = p.brandId ? brandById.get(p.brandId) : null;
  return {
    id: p.id, name: p.name, category: p.category, colour: p.colour || null, image: p.image,
    price: typeof p.price === 'number' ? p.price : null, currency: p.currency || 'GBP',
    tier: p.tier || tierFromPrice(p.price), brand: brand ? brand.name : (p.brandName || null),
    inStock: p.inStock !== false, preview: Boolean(p.preview), slot: p.slot || slotFor(p.category),
  };
}

// Brands that suit a category, cheapest tier first, so preview items can still point somewhere useful.
export function brandsFor(category, occasion) {
  const catWords = { Shirt: /shirt|tailor|premium|high street|independent/i, 'T-shirt': /high street|independent|premium|sport/i,
    Jumper: /premium|independent|high street|outdoor/i, Jacket: /outdoor|premium|tailor|high street/i,
    Trousers: /high street|premium|tailor|independent/i, Shoes: /footwear|retailer/i };
  const re = catWords[category] || /./;
  const order = { '£': 0, '££': 1, '£££': 2 };
  const label = { pub: 'Pub', wedding: 'Wedding', interview: 'Interview', casual: 'Weekend', date: 'Date', office: 'Office' }[occasion];
  return brands
    .filter((b) => re.test(b.category) && (!label || (b.occasions || []).includes(label)))
    .sort((a, b) => (order[a.tier] ?? 3) - (order[b.tier] ?? 3) || a.name.localeCompare(b.name));
}
