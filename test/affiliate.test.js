import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAffiliateLink, withUtm } from '../src/affiliate.js';

const ids = { awinPublisherId: '123456', rakutenSiteId: 'ABCdef', cjPublisherId: '7654321', webgainsCampaignId: '999', skimlinksSiteId: '' };
const dest = 'https://www.example-shop.co.uk/mens/shirts/navy-oxford?colour=navy';
const brand = (network, extra = {}) => ({ name: 'Shop', affiliate: { network, status: 'approved', advertiserId: '42', ...extra } });

test('unapproved brand gets a plain link with UTM tags', () => {
  const l = buildAffiliateLink(dest, { affiliate: { network: 'Awin', status: 'not-applied' } }, ids);
  assert.equal(l.tracked, false);
  const u = new URL(l.url);
  assert.equal(u.hostname, 'www.example-shop.co.uk');
  assert.equal(u.searchParams.get('utm_source'), 'sorted');
  assert.equal(u.searchParams.get('colour'), 'navy');
});

test('Awin deep link carries publisher, advertiser and encoded destination', () => {
  const l = buildAffiliateLink(dest, brand('Awin'), ids, 'ref1');
  const u = new URL(l.url);
  assert.equal(l.tracked, true);
  assert.equal(u.hostname, 'www.awin1.com');
  assert.equal(u.searchParams.get('awinmid'), '42');
  assert.equal(u.searchParams.get('awinaffid'), '123456');
  assert.equal(u.searchParams.get('clickref'), 'ref1');
  assert.equal(u.searchParams.get('ued'), dest);
});

test('Rakuten, Partnerize and Webgains links decode back to the destination', () => {
  assert.equal(new URL(buildAffiliateLink(dest, brand('Rakuten'), ids).url).searchParams.get('murl'), dest);
  assert.equal(new URL(buildAffiliateLink(dest, brand('Webgains'), ids).url).searchParams.get('wgtarget'), dest);
  const pz = buildAffiliateLink(dest, brand('Partnerize', { advertiserId: '1011l3abc' }), ids, 'r');
  assert.match(pz.url, /^https:\/\/prf\.hn\/click\/camref:1011l3abc\/pubref:r\/destination:/);
  assert.equal(decodeURIComponent(pz.url.split('destination:')[1]), dest);
});

test('CJ link puts the destination at the end', () => {
  const l = buildAffiliateLink(dest, brand('CJ'), ids, 's1');
  assert.ok(l.url.startsWith('https://www.anrdoezrs.net/links/7654321/type/dlg/sid/s1/https://'));
});

test('approved brand without our publisher ID falls back to a plain link', () => {
  const l = buildAffiliateLink(dest, brand('Awin'), { ...ids, awinPublisherId: '' });
  assert.equal(l.tracked, false);
});

test('a brand tracking template wins and fills {url}', () => {
  const l = buildAffiliateLink(dest, brand('Impact', { trackingTemplate: 'https://shop.sjv.io/c/1/2/3?u={url}&subId1={clickref}' }), ids, 'x');
  assert.equal(new URL(l.url).searchParams.get('u'), dest);
  assert.equal(new URL(l.url).searchParams.get('subId1'), 'x');
});

test('Skimlinks catches clicks for brands not approved yet', () => {
  const l = buildAffiliateLink(dest, { affiliate: { network: 'Awin', status: 'applied' } }, { ...ids, skimlinksSiteId: '555X' });
  assert.equal(l.network, 'Skimlinks');
  assert.equal(new URL(l.url).hostname, 'go.redirectingat.com');
  assert.equal(new URL(l.url).searchParams.get('url'), dest);
});

test('withUtm keeps existing UTM tags and survives bad URLs', () => {
  assert.equal(new URL(withUtm('https://a.com/?utm_source=x')).searchParams.get('utm_source'), 'x');
  assert.equal(withUtm('not a url'), 'not a url');
});
