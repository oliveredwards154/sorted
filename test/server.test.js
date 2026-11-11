import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Keep test sign-ups and counts out of the real data folder.
const dataDir = mkdtempSync(path.join(tmpdir(), 'sorted-test-'));
process.env.DATA_DIR = dataDir;
process.env.ADMIN_PASSWORD = 'test-pass';

let server, base;
before(async () => {
  const { createServer } = await import('../server.js');
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const get = (p, opts) => fetch(base + p, { redirect: 'manual', ...opts });

test('pages load, including deep links into the app', async () => {
  for (const p of ['/', '/occasion/pub', '/occasion/wedding/rounds', '/upload', '/results', '/shops', '/wardrobe', '/about', '/privacy', '/cookies', '/affiliate-disclosure']) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get('content-type'), /text\/html/, p);
    assert.ok(r.headers.get('content-security-policy'), p);
  }
  assert.equal((await get('/no-such-page')).status, 404);
});

test('API returns occasions, products and brands', async () => {
  const occ = await (await get('/api/occasions')).json();
  assert.equal(occ.length, 6);
  const prod = await (await get('/api/products?category=Shoes&text=brown%20brogues&colour=Brown')).json();
  assert.ok(prod.results.length > 0);
  assert.equal(prod.source, 'preview');
  assert.ok(prod.shops.length > 0, 'preview mode suggests shops');
  assert.equal((await get('/api/products?category=Hats')).status, 400);
  const brands = await (await get('/api/brands')).json();
  assert.ok(brands.length >= 150);
  assert.equal(brands[0].affiliate, undefined, 'internal affiliate details stay private');
});

test('shop links redirect to the shop and are not indexed', async () => {
  const r = await get('/go/b/reiss');
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location'), /^https:\/\/(www\.)?reiss\.com/);
  assert.match(r.headers.get('location'), /utm_source=sorted/);
  assert.equal(r.headers.get('x-robots-tag'), 'noindex');
  assert.equal((await get('/go/b/not-a-brand')).status, 404);
  assert.equal((await get('/go/p/not-a-product')).status, 404);
});

test('photo recognition is off without a key and rejects bad input', async () => {
  const cfg = await (await get('/api/config')).json();
  if (!cfg.recognition) {
    const r = await get('/api/recognise', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: 'data:image/png;base64,AAAA' }) });
    assert.equal(r.status, 503);
  }
  const bad = await get('/api/recognise', { method: 'POST', body: 'not json' });
  assert.equal(bad.status, 400);
});

test('image proxy only serves catalogue images and static paths cannot escape', async () => {
  assert.equal((await get('/img?u=' + encodeURIComponent('https://evil.example.com/x.jpg'))).status, 404);
  assert.equal((await get('/../package.json')).status, 404);
  assert.equal((await get('/%2e%2e/package.json')).status, 404);
  assert.equal((await get('/robots.txt')).status, 200);
  assert.match(await (await get('/sitemap.xml')).text(), /occasion\/wedding/);
});

test('guide pages are server-rendered, linked and in the sitemap', async () => {
  const idx = await get('/what-to-wear');
  assert.equal(idx.status, 200);
  const idxHtml = await idx.text();
  assert.match(idxHtml, /href="\/what-to-wear\/a-wedding"/);
  const r = await get('/what-to-wear/a-wedding');
  assert.equal(r.status, 200);
  const h = await r.text();
  assert.match(h, /<h1>What to wear to a wedding as a guest<\/h1>/);
  assert.match(h, /<link rel="canonical" href="http:\/\/localhost:3000\/what-to-wear\/a-wedding">/);
  assert.match(h, /application\/ld\+json/);
  assert.match(h, /\/occasion\/wedding\/rounds/);
  assert.equal((h.match(/class="card"/g) || []).length, 6, 'six looks');
  assert.equal((await get('/what-to-wear/nowhere')).status, 404);
  const map = await (await get('/sitemap.xml')).text();
  for (const slug of ['the-pub', 'a-wedding', 'a-job-interview', 'the-weekend', 'a-first-date', 'the-office']) assert.match(map, new RegExp(`/what-to-wear/${slug}<`));
});

test('usage events are counted without personal data', async () => {
  const send = (body, headers = {}) => get('/api/event', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });
  assert.equal((await send({ e: 'rounds_start', o: 'wedding', p: '/occasion/wedding/rounds' })).status, 204);
  assert.equal((await send({ e: 'page_view', p: '/results', r: 'https://www.instagram.com/some/profile?x=1' })).status, 204);
  assert.equal((await send({ e: 'not_an_event' })).status, 204);
  await send({ e: 'rounds_start', o: 'wedding' }, { dnt: '1' }); // not counted
  assert.equal((await get('/api/event')).status, 405);
  const page = await (await get('/admin', { headers: { authorization: 'Basic ' + Buffer.from('x:test-pass').toString('base64') } })).text();
  assert.match(page, /rounds start · wedding<\/td><td>1</);
  assert.match(page, /instagram\.com<\/td><td>1</);
  assert.doesNotMatch(page, /some\/profile/);
  assert.doesNotMatch(page, /not_an_event/);
});

test('email sign-up, duplicate, bad input and unsubscribe', async () => {
  const post = (body, accept = 'application/json') => get('/api/subscribe', { method: 'POST', body: new URLSearchParams(body), headers: { accept } });
  let r = await post({ email: 'Test@Example.com', occasion: 'wedding' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
  assert.equal((await post({ email: 'test@example.com', occasion: 'wedding' })).status, 200, 'repeat sign-up is fine');
  assert.equal((await post({ email: 'not-an-email' })).status, 400);
  r = await post({ email: 'bot@example.com', website: 'spam' });
  assert.equal(r.status, 200, 'honeypot looks like success to bots');
  // Without JavaScript the form gets an HTML page back.
  r = await post({ email: 'nojs@example.com' }, 'text/html');
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.match(await r.text(), /signed up/);

  const lines = readFileSync(path.join(dataDir, 'subscribers.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.filter((l) => l.email === 'test@example.com').length, 1, 'stored once, lower-cased');
  assert.ok(!lines.some((l) => l.email === 'bot@example.com'));

  const auth = { authorization: 'Basic ' + Buffer.from('x:test-pass').toString('base64') };
  const csv = await (await get('/admin/subscribers.csv', { headers: auth })).text();
  assert.match(csv, /"test@example.com","wedding"/);
  const token = /unsubscribe\?t=([a-f0-9]{32})/.exec(csv.split('\n').find((l) => l.includes('test@example.com')))[1];

  const confirm = await get('/unsubscribe?t=' + token);
  assert.match(await confirm.text(), /<form method="post"/, 'GET only shows a button, so link scanners cannot unsubscribe people');
  r = await get('/unsubscribe?t=' + token, { method: 'POST' });
  assert.match(await r.text(), /unsubscribed/);
  const after = await (await get('/admin/subscribers.csv', { headers: auth })).text();
  assert.doesNotMatch(after, /test@example.com/);
});

test('admin needs the password', async () => {
  assert.equal((await get('/admin')).status, 401);
  assert.equal((await get('/admin', { headers: { authorization: 'Basic ' + Buffer.from('x:wrong').toString('base64') } })).status, 401);
  assert.equal((await get('/admin/subscribers.csv')).status, 401);
  assert.match(await (await get('/robots.txt')).text(), /Disallow: \/admin/);
});

test('legal pages have no unfilled template tags', async () => {
  for (const u of ['/privacy', '/about', '/', '/nope-404', '/privacy.html']) {
    const t = await (await get(u)).text();
    assert.doesNotMatch(t, /\{\{/, u);
  }
  assert.match(await (await get('/privacy')).text(), /\[OPERATOR NAME\]/, 'stays obvious until OPERATOR_NAME is set');
});
