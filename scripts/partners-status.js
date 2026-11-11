#!/usr/bin/env node
// Shows where each partner connection stands: which networks you've set up, which brands are
// approved, and which approved brands are still missing the ID needed to build tracked links.
//   npm run partners:status
import { config } from '../src/config.js';
import { brands } from '../src/catalogue.js';
import { buildAffiliateLink } from '../src/affiliate.js';

const networks = {
  Awin: config.awinPublisherId, Rakuten: config.rakutenSiteId, CJ: config.cjPublisherId,
  Webgains: config.webgainsCampaignId, Skimlinks: config.skimlinksSiteId,
};
console.log('\nNetworks');
for (const [n, v] of Object.entries(networks)) console.log(`  ${v ? '✓' : '·'} ${n.padEnd(11)} ${v ? 'publisher ID set' : 'not set up'}`);
console.log('  · Partnerize  set per brand (each approved brand gets its own camref in data/brands.json)');

const by = (s) => brands.filter((b) => (b.affiliate?.status || 'not-applied') === s);
const counts = ['not-applied', 'applied', 'approved', 'declined', 'direct'].map((s) => `${s}: ${by(s).length}`);
console.log(`\nBrands (${brands.length})\n  ${counts.join(' · ')}`);

const approved = by('approved');
const broken = approved.filter((b) => !buildAffiliateLink(b.website, b, config, 'test').tracked);
if (approved.length) {
  console.log('\nApproved brands');
  for (const b of approved) {
    const l = buildAffiliateLink(b.website, b, config, 'test');
    console.log(`  ${l.tracked ? '✓' : '✗'} ${b.name.padEnd(28)} ${b.affiliate.network.padEnd(11)} ${l.tracked ? l.url.slice(0, 70) + '…' : 'missing ID or publisher ID: links are NOT tracked'}`);
  }
}
if (broken.length) process.exitCode = 1;
console.log('\nTo mark a brand approved, edit data/brands.json: set affiliate.status to "approved" and affiliate.advertiserId to the ID the network shows (see docs/PARTNERS.md).\n');
