#!/usr/bin/env node
// Downloads every configured product feed and writes data/catalogue.json.
//   npm run feeds:sync            download and rebuild
//   npm run feeds:sync -- --file path/to/feed.csv --network Awin   test with a local file
// Run it daily (a cron job on your host, or a scheduled GitHub Action) to keep prices and stock fresh.
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { ROOT, config } from '../src/config.js';
import { brands } from '../src/catalogue.js';
import { downloadFeed, readAwinCsv } from '../src/feeds/awin.js';
import { readGenericCsv } from '../src/feeds/generic.js';
import { normaliseProduct, makeBrandMatcher } from '../src/feeds/normalise.js';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

const sources = [];
const localFile = flag('--file');
if (localFile) {
  const network = flag('--network') || 'Awin';
  sources.push({ name: `local ${path.basename(localFile)}`, network, text: readFileSync(localFile, 'utf8'), kind: network === 'Awin' ? 'awin' : 'generic', columns: {} });
} else {
  config.awinFeedUrls.forEach((url, i) => sources.push({ name: `Awin feed ${i + 1}`, network: 'Awin', url, kind: 'awin' }));
  const cfgFile = path.join(ROOT, 'data', 'feeds.json');
  if (existsSync(cfgFile)) {
    for (const s of JSON.parse(readFileSync(cfgFile, 'utf8'))) {
      const url = s.urlEnv ? process.env[s.urlEnv] : s.url;
      if (!url && !s.file) { console.warn(`Skipping "${s.name}": set ${s.urlEnv || 'a url'} first.`); continue; }
      sources.push({ ...s, url, kind: 'generic' });
    }
  }
}

if (!sources.length) {
  console.log('No feeds configured yet. Add AWIN_FEED_URLS to .env (see docs/PARTNERS.md). The site keeps using the preview catalogue.');
  process.exit(0);
}

const matchBrand = makeBrandMatcher(brands);
const products = new Map();
const report = [];

for (const s of sources) {
  try {
    const text = s.text ?? (s.file ? readFileSync(path.resolve(ROOT, s.file), 'utf8') : await downloadFeed(s.url));
    const rows = s.kind === 'awin' ? readAwinCsv(text) : readGenericCsv(text, s);
    let seen = 0, kept = 0;
    for (const row of rows) {
      seen++;
      const p = normaliseProduct(row, matchBrand);
      if (p) { products.set(p.id, p); kept++; }
    }
    report.push(`${s.name}: ${kept} of ${seen} rows kept`);
  } catch (err) {
    report.push(`${s.name}: FAILED – ${err.message}`);
  }
}

const out = { updatedAt: new Date().toISOString(), count: products.size, products: [...products.values()] };
const tmp = config.catalogueFile + '.tmp';
writeFileSync(tmp, JSON.stringify(out));
renameSync(tmp, config.catalogueFile);
console.log(report.join('\n'));
console.log(`Wrote ${products.size} products to ${path.relative(ROOT, config.catalogueFile)}`);
