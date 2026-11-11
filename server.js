// Sorted. web server. No dependencies: run with `npm start` (Node 22 or newer).
import http from 'node:http';
import { readFile, stat, appendFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config, publicConfig, ROOT } from './src/config.js';
import { occasions, brands, brandById, search, getProduct, loadCatalogue, brandsFor } from './src/catalogue.js';
import { buildAffiliateLink } from './src/affiliate.js';
import { recognise } from './src/recognise.js';
import { CATEGORIES, COLOURS } from './src/classify.js';

const PUBLIC = path.join(ROOT, 'public');
const APP_ROUTES = /^\/(|occasion\/[a-z]+(\/[a-z]+)?|upload|results|shops|wardrobe)$/;
const PAGES = { '/about': 'about.html', '/privacy': 'privacy.html', '/cookies': 'cookies.html', '/affiliate-disclosure': 'affiliate-disclosure.html' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.md': 'text/plain; charset=utf-8' };

const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(self), microphone=(), geolocation=()',
};

function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, { ...SECURITY_HEADERS, ...(isObj ? { 'content-type': TYPES['.json'] } : {}), ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Simple per-visitor limit so nobody can run up the Claude bill.
const hits = new Map();
function rateLimited(ip, max = 10, windowMs = 60_000) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}

const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

async function logClick(entry) {
  try { await appendFile(config.clickLogFile, JSON.stringify(entry) + '\n'); } catch { /* logging must never block a redirect */ }
}

async function serveFile(res, file, cacheSeconds = 0) {
  try {
    const st = await stat(file);
    if (!st.isFile()) return false;
    res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': st.size, 'cache-control': cacheSeconds ? `public, max-age=${cacheSeconds}` : 'no-cache' });
    createReadStream(file).pipe(res);
    return true;
  } catch { return false; }
}

// Research notes in brands.json are for us, not visitors, so the public description is built from facts.
const KIND = { 'High street': 'High street menswear', Premium: 'Premium menswear', Independent: 'Independent label', Footwear: 'Shoes and boots',
  Accessories: 'Bags and accessories', Retailer: 'Multi-brand shop', Tailoring: 'Suits and tailoring', 'Outdoor & heritage': 'Outdoor and heritage', Sportswear: 'Sportswear and trainers' };
const blurb = (b) => `${KIND[b.category] || b.category}${b.occasions?.length ? ' · good for ' + b.occasions.slice(0, 3).join(', ').toLowerCase() : ''}`;
const publicBrand = (b) => ({ id: b.id, name: b.name, website: b.website, tier: b.tier, category: b.category,
  occasions: b.occasions, notes: blurb(b), partner: b.affiliate?.status === 'approved' });

async function handle(req, res) {
  const url = new URL(req.url, 'http://local');
  const p = url.pathname;

  if (p === '/healthz') return send(res, 200, { ok: true, catalogue: loadCatalogue().source });

  // ---- API ----
  if (p === '/api/config') return send(res, 200, { ...publicConfig(), categories: CATEGORIES, colours: COLOURS, catalogue: loadCatalogue().source });
  if (p === '/api/occasions') return send(res, 200, occasions, { 'cache-control': 'public, max-age=300' });

  if (p === '/api/products') {
    const category = url.searchParams.get('category');
    if (!CATEGORIES.includes(category)) return send(res, 400, { error: 'bad_category', message: `category must be one of ${CATEGORIES.join(', ')}` });
    const out = search({ category, text: url.searchParams.get('text') || '', colour: url.searchParams.get('colour') || '',
      occasion: url.searchParams.get('occasion') || '', tier: url.searchParams.get('tier') || '', limit: url.searchParams.get('limit') });
    if (out.source === 'preview') out.shops = brandsFor(category, url.searchParams.get('occasion')).slice(0, 12).map(publicBrand);
    return send(res, 200, out);
  }

  if (p === '/api/brands') return send(res, 200, brands.map(publicBrand), { 'cache-control': 'public, max-age=300' });

  if (p === '/api/recognise') {
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    if (rateLimited(clientIp(req))) return send(res, 429, { error: 'busy', message: 'Too many photos just now. Try again in a minute.' });
    try {
      const body = JSON.parse(await readBody(req, config.maxUploadBytes * 1.4));
      const out = await recognise(body.image);
      return send(res, out.status, out.body);
    } catch (err) {
      return send(res, err.status || 400, { error: 'bad_request', message: err.status === 413 ? 'That photo is too large.' : 'Send the photo as JSON: {"image": "data:image/jpeg;base64,..."}' });
    }
  }

  // ---- Outbound links: every shop click goes through here so it can be tracked and logged ----
  let m = /^\/go\/p\/([A-Za-z0-9._:-]{1,200})$/.exec(p);
  if (m) {
    const product = getProduct(m[1]);
    if (!product || !product.url) return send(res, 404, 'That product is no longer available.', { 'content-type': TYPES['.txt'] });
    const brand = product.brandId ? brandById.get(product.brandId) : null;
    const ref = randomUUID().replace(/-/g, '').slice(0, 12);
    const link = product.affiliateUrl && !brand?.affiliate?.trackingTemplate
      ? { url: product.affiliateUrl, tracked: true, network: product.network }
      : buildAffiliateLink(product.url, brand, config, ref);
    logClick({ t: new Date().toISOString(), ref, kind: 'product', id: product.id, brand: brand?.id || null, network: link.network, tracked: link.tracked, occasion: url.searchParams.get('o') || null });
    return send(res, 302, '', { location: link.url, 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
  }
  m = /^\/go\/b\/([a-z0-9-]{1,80})$/.exec(p);
  if (m) {
    const brand = brandById.get(m[1]);
    if (!brand) return send(res, 404, 'Unknown shop.', { 'content-type': TYPES['.txt'] });
    const ref = randomUUID().replace(/-/g, '').slice(0, 12);
    const link = buildAffiliateLink(brand.website, brand, config, ref);
    logClick({ t: new Date().toISOString(), ref, kind: 'brand', brand: brand.id, network: link.network, tracked: link.tracked, occasion: url.searchParams.get('o') || null });
    return send(res, 302, '', { location: link.url, 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
  }

  // ---- Image proxy, so the browser can compare a photo with product images from shop servers ----
  if (p === '/img') {
    const target = url.searchParams.get('u') || '';
    const allowed = loadCatalogue().products.some((x) => x.image === target);
    if (!allowed || !/^https:\/\//.test(target)) return send(res, 404, 'Not found', { 'content-type': TYPES['.txt'] });
    try {
      const r = await fetch(target, { signal: AbortSignal.timeout(8000) });
      const type = r.headers.get('content-type') || '';
      if (!r.ok || !type.startsWith('image/')) return send(res, 502, 'Image unavailable', { 'content-type': TYPES['.txt'] });
      const buf = Buffer.from(await r.arrayBuffer());
      return send(res, 200, buf, { 'content-type': type, 'cache-control': 'public, max-age=86400' });
    } catch { return send(res, 502, 'Image unavailable', { 'content-type': TYPES['.txt'] }); }
  }

  if (p === '/robots.txt') return send(res, 200, `User-agent: *\nDisallow: /go/\nDisallow: /api/\nDisallow: /img\nSitemap: ${config.siteUrl}/sitemap.xml\n`, { 'content-type': TYPES['.txt'] });
  if (p === '/sitemap.xml') {
    const urls = ['/', '/shops', '/about', '/privacy', '/cookies', '/affiliate-disclosure', ...occasions.map((o) => `/occasion/${o.id}`)];
    return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${config.siteUrl}${u}</loc></url>`).join('\n')}\n</urlset>\n`, { 'content-type': TYPES['.xml'] });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', { 'content-type': TYPES['.txt'] });

  // ---- Pages and static files ----
  if (PAGES[p]) return (await serveFile(res, path.join(PUBLIC, PAGES[p]))) || send(res, 404, 'Not found');
  if (APP_ROUTES.test(p)) return serveFile(res, path.join(PUBLIC, 'index.html'));

  const file = path.normalize(path.join(PUBLIC, decodeURIComponent(p)));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 404, 'Not found', { 'content-type': TYPES['.txt'] });
  const longCache = p.startsWith('/images/') ? 86400 * 7 : 0;
  if (await serveFile(res, file, longCache)) return;

  const notFound = await readFile(path.join(PUBLIC, '404.html')).catch(() => null);
  return send(res, 404, notFound || 'Not found', { 'content-type': TYPES['.html'] });
}

export function createServer() {
  return http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) send(res, 500, { error: 'server', message: 'Something went wrong on our side.' });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, 'server.js')) {
  createServer().listen(config.port, () => {
    const cat = loadCatalogue();
    console.log(`Sorted. running at http://localhost:${config.port}`);
    console.log(`Catalogue: ${cat.source === 'feeds' ? `${cat.products.length} products from partner feeds` : 'preview items (no feeds connected yet)'}`);
    console.log(`Photo reading: ${config.anthropicApiKey ? 'on' : 'off (set ANTHROPIC_API_KEY to switch it on)'}`);
  });
}
