import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';

let server, base;
before(async () => {
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
