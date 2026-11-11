// Sorted. web server. No dependencies: run with `npm start` (Node 22 or newer).
import http from 'node:http';
import { readFile, stat, appendFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { randomUUID, timingSafeEqual, createHash } from 'node:crypto';
import { config, publicConfig, ROOT } from './src/config.js';
import { occasions, brands, brandById, search, getProduct, loadCatalogue, brandsFor } from './src/catalogue.js';
import { buildAffiliateLink } from './src/affiliate.js';
import { recognise } from './src/recognise.js';
import { CATEGORIES, COLOURS } from './src/classify.js';
import { renderGuide, renderGuideIndex, renderMessage, guidePath, guides } from './src/pages.js';
import { createStats, createSubscribers, validEmail, refHost, toCsv } from './src/datastore.js';

const stats = createStats(config.statsFile);
const subscribers = createSubscribers(config.subscribersFile);
const flushTimer = setInterval(() => stats.flush(), 60_000);
flushTimer.unref();

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

const html = (res, status, body) => send(res, status, body, { 'content-type': TYPES['.html'] });

// /admin uses HTTP basic auth (any username, ADMIN_PASSWORD as the password).
function isAdmin(req) {
  if (!config.adminPassword) return false;
  const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
  if (!m) return false;
  const pass = Buffer.from(m[1], 'base64').toString('utf8').split(':').slice(1).join(':');
  const h = (x) => createHash('sha256').update(x).digest();
  return timingSafeEqual(h(pass), h(config.adminPassword));
}

function parseForm(text, type = '') {
  if (/json/.test(type)) { try { return JSON.parse(text); } catch { return {}; } }
  return Object.fromEntries(new URLSearchParams(text));
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

  // ---- Anonymous usage counts (no cookies, nothing stored per person) ----
  if (p === '/api/event') {
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    if (rateLimited('ev:' + clientIp(req), 120)) return send(res, 204, '');
    try {
      const ev = JSON.parse(await readBody(req, 2048));
      if (req.headers.dnt !== '1' && req.headers['sec-gpc'] !== '1')
        stats.record({ e: String(ev.e || ''), o: String(ev.o || ''), p: String(ev.p || ''), r: refHost(String(ev.r || ''), new URL(config.siteUrl).hostname) });
    } catch { /* ignore junk */ }
    return send(res, 204, '');
  }

  // ---- Email sign-up ----
  if (p === '/api/subscribe') {
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const wantsJson = /json/.test(req.headers.accept || '');
    const reply = (status, ok, message) => wantsJson ? send(res, status, { ok, message })
      : (({ status: st, html: h }) => html(res, st, h))(renderMessage(ok ? 'You’re signed up' : 'That didn’t work', message, status));
    if (rateLimited('sub:' + clientIp(req), 5)) return reply(429, false, 'Too many tries just now. Try again in a minute.');
    let body;
    try { body = parseForm(await readBody(req, 4096), req.headers['content-type']); } catch { return reply(400, false, 'Something was wrong with that form.'); }
    if (body.website) return reply(200, true, 'Thanks. We’ll be in touch.'); // honeypot: bots fill in the hidden field
    if (!validEmail(body.email)) return reply(400, false, 'That email address doesn’t look right. Check it and try again.');
    await subscribers.add(body.email, String(body.occasion || ''));
    stats.record({ e: 'signup', o: String(body.occasion || '') });
    return reply(200, true, 'Thanks. We’ll email you when there are new looks. Every email has a one-click unsubscribe link.');
  }

  if (p === '/unsubscribe') {
    const t = url.searchParams.get('t') || '';
    if (req.method === 'POST') {
      const ok = await subscribers.remove(t);
      const m = renderMessage(ok ? 'You’re unsubscribed' : 'Already unsubscribed', ok ? 'We won’t email you again. Your address has been removed.' : 'We couldn’t find that sign-up. You may already be unsubscribed.');
      return html(res, 200, m.html);
    }
    const m = renderMessage('Unsubscribe', 'Click the button below to stop our emails.');
    return html(res, 200, m.html.replace('<a class="btn" href="/" style="align-self:flex-start">Back to Sorted.</a>',
      `<form method="post" action="/unsubscribe?t=${encodeURIComponent(t.replace(/[^a-f0-9]/g, ''))}"><button class="btn" type="submit">Unsubscribe</button></form>`));
  }

  // ---- Admin: usage counts and sign-ups, password protected ----
  if (p === '/admin' || p === '/admin/subscribers.csv') {
    if (!config.adminPassword) return send(res, 404, 'Not found', { 'content-type': TYPES['.txt'] });
    if (!isAdmin(req)) return send(res, 401, 'Password needed', { 'content-type': TYPES['.txt'], 'www-authenticate': 'Basic realm="Sorted admin", charset="UTF-8"' });
    const priv = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };
    if (p === '/admin/subscribers.csv')
      return send(res, 200, toCsv(subscribers.list(), config.siteUrl), { ...priv, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="sorted-signups.csv"' });
    return send(res, 200, adminPage(), { ...priv, 'content-type': TYPES['.html'] });
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
    stats.record({ e: 'shop_click', o: url.searchParams.get('o') || '' });
    logClick({ t: new Date().toISOString(), ref, kind: 'product', id: product.id, brand: brand?.id || null, network: link.network, tracked: link.tracked, occasion: url.searchParams.get('o') || null });
    return send(res, 302, '', { location: link.url, 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
  }
  m = /^\/go\/b\/([a-z0-9-]{1,80})$/.exec(p);
  if (m) {
    const brand = brandById.get(m[1]);
    if (!brand) return send(res, 404, 'Unknown shop.', { 'content-type': TYPES['.txt'] });
    const ref = randomUUID().replace(/-/g, '').slice(0, 12);
    const link = buildAffiliateLink(brand.website, brand, config, ref);
    stats.record({ e: 'shop_click', o: url.searchParams.get('o') || '' });
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

  if (p === '/robots.txt') return send(res, 200, `User-agent: *\nDisallow: /go/\nDisallow: /api/\nDisallow: /img\nDisallow: /admin\nDisallow: /unsubscribe\nSitemap: ${config.siteUrl}/sitemap.xml\n`, { 'content-type': TYPES['.txt'] });
  if (p === '/sitemap.xml') {
    const urls = ['/', '/what-to-wear', ...occasions.map((o) => guidePath(o.id)).filter(Boolean), '/shops', '/about', '/privacy', '/cookies', '/affiliate-disclosure', ...occasions.map((o) => `/occasion/${o.id}`)];
    return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${config.siteUrl}${u}</loc></url>`).join('\n')}\n</urlset>\n`, { 'content-type': TYPES['.xml'] });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', { 'content-type': TYPES['.txt'] });

  // ---- Guides ----
  if (p === '/what-to-wear') return html(res, 200, renderGuideIndex());
  m = /^\/what-to-wear\/([a-z-]{1,60})$/.exec(p);
  if (m) {
    const page = renderGuide(m[1]);
    if (page) return html(res, 200, page);
  }

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

function adminPage() {
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const table = (title, rows) => `<h2>${title}</h2><table><tbody>${rows.length ? rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('') : '<tr><td>Nothing yet</td></tr>'}</tbody></table>`;
  const sum = stats.summary(30);
  const sorted = (prefix) => Object.entries(sum).filter(([k]) => prefix(k)).sort((a, b) => b[1] - a[1]);
  const today = stats.summary(1);
  const days = Object.keys(stats.days()).sort().slice(-14).reverse().map((d) => [d, stats.days()[d].page_view || 0]);
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Admin – ${esc(config.siteName)}</title><link rel="stylesheet" href="/css/site.css">
<style>table{border-collapse:collapse;width:100%;max-width:640px}td{padding:6px 10px;border-bottom:1px solid #e5e5e5}td:last-child{text-align:right;font-variant-numeric:tabular-nums}</style></head>
<body><main class="wrap prose" style="padding-top:32px;padding-bottom:48px">
<h1>${esc(config.siteName)} admin</h1>
<p class="lede">Last 30 days. Counts only: no cookies, and nothing is stored per person. Visitors with Do Not Track or Global Privacy Control switched on aren't counted.</p>
<p>Today: <b>${today.page_view || 0}</b> page views, <b>${today.shop_click || 0}</b> shop clicks, <b>${today.signup || 0}</b> sign-ups.</p>
<p>Email sign-ups: <b>${subscribers.count()}</b> · <a href="/admin/subscribers.csv">Download as CSV</a></p>
${table('Funnel', ['page_view', 'occasion_open', 'rounds_start', 'style_done', 'style_save', 'results_view', 'shop_click', 'upload_start', 'upload_done', 'guide_play', 'signup'].map((k) => [k.replace(/_/g, ' '), sum[k] || 0]))}
${table('By occasion', sorted((k) => /^(rounds_start|style_done|shop_click):/.test(k)).map(([k, v]) => [k.replace(':', ' · ').replace(/_/g, ' '), v]))}
${table('Pages', sorted((k) => k.startsWith('page:')).map(([k, v]) => [k.slice(5), v]))}
${table('Where visitors came from', sorted((k) => k.startsWith('from:')).slice(0, 30).map(([k, v]) => [k.slice(5), v]))}
${table('Page views by day', days)}
</main></body></html>`;
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
  const shutdown = () => { stats.flush(); process.exit(0); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  createServer().listen(config.port, () => {
    const cat = loadCatalogue();
    console.log(`Sorted. running at http://localhost:${config.port}`);
    console.log(`Catalogue: ${cat.source === 'feeds' ? `${cat.products.length} products from partner feeds` : 'preview items (no feeds connected yet)'}`);
    console.log(`Data folder: ${config.dataDir}${config.adminPassword ? ' · /admin is on' : ' · /admin is off (set ADMIN_PASSWORD)'}`);
    console.log(`Photo reading: ${config.anthropicApiKey ? 'on' : 'off (set ANTHROPIC_API_KEY to switch it on)'}`);
  });
}
