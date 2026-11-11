#!/usr/bin/env node
// Checks that every shop website and application link in data/brands.json still loads.
//   npm run links:check
import { brands } from '../src/catalogue.js';

const urls = [];
for (const b of brands) {
  urls.push([b.name, 'website', b.website]);
  if (b.affiliate?.applyUrl) urls.push([b.name, 'apply link', b.affiliate.applyUrl]);
}

async function check(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const r = await fetch(url, { method, redirect: 'follow', signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'Mozilla/5.0 (link check)' } });
      if (r.ok || (method === 'GET' && r.status < 500 && r.status !== 404)) return r.status;
      if (method === 'GET') return r.status;
    } catch (e) { if (method === 'GET') return e.name === 'TimeoutError' ? 'timeout' : 'error'; }
  }
}

let bad = 0, unreachable = 0;
const queue = [...urls];
await Promise.all(Array.from({ length: 8 }, async () => {
  while (queue.length) {
    const [name, kind, url] = queue.shift();
    const s = await check(url);
    if (s === 'error' || s === 'timeout') unreachable++;
    if (s === 404 || s === 'error' || s === 'timeout' || (typeof s === 'number' && s >= 500)) { bad++; console.log(`✗ ${name} (${kind}): ${s} ${url}`); }
  }
}));
if (unreachable === urls.length) {
  console.log('\nEvery link failed to connect, so this computer probably has no internet access (or a firewall is blocking it). Nothing was actually checked.');
  process.exit(2);
}
console.log(`\nChecked ${urls.length} links, ${bad} problem${bad === 1 ? '' : 's'}. Some shops block automated checks (403); open those by hand.`);
