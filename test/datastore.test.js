import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStats, createSubscribers, pagePath, refHost, validEmail, toCsv } from '../src/datastore.js';

const dir = () => mkdtempSync(path.join(tmpdir(), 'sorted-ds-'));

test('page paths collapse to a fixed set', () => {
  assert.equal(pagePath('/'), '/');
  assert.equal(pagePath('/occasion/wedding/rounds'), '/rounds');
  assert.equal(pagePath('/what-to-wear/a-wedding'), '/what-to-wear/a-wedding');
  assert.equal(pagePath('/results'), '/results');
  assert.equal(pagePath('/anything/else?email=x'), 'other');
});

test('referrers keep only the host, and drop our own site', () => {
  assert.equal(refHost('https://www.instagram.com/p/abc?igsh=1'), 'instagram.com');
  assert.equal(refHost('https://sorted.example/what-to-wear', 'sorted.example'), '');
  assert.equal(refHost('http://192.168.0.1/x'), '');
  assert.equal(refHost('not a url'), '');
});

test('stats count by day and survive a restart', () => {
  const file = path.join(dir(), 'stats.json');
  const now = new Date('2026-11-11T10:00:00Z');
  const s = createStats(file);
  assert.equal(s.record({ e: 'shop_click', o: 'pub' }, now), true);
  s.record({ e: 'shop_click', o: 'pub' }, now);
  assert.equal(s.record({ e: 'made_up' }, now), false);
  s.record({ e: 'shop_click', o: 'Robert@example.com' }, now); // junk occasion is dropped, event still counted
  s.flush();
  const again = createStats(file);
  assert.deepEqual(again.days()['2026-11-11'], { shop_click: 3, 'shop_click:pub': 2 });
  assert.equal(again.summary(30, now).shop_click, 3);
});

test('subscribers: add, dedupe, unsubscribe, reload', async () => {
  const file = path.join(dir(), 'subs.jsonl');
  const s = createSubscribers(file);
  assert.deepEqual(await s.add(' A@B.co.uk ', 'wedding'), { added: true });
  assert.deepEqual(await s.add('a@b.co.uk', 'wedding'), { added: false });
  await s.add('a@b.co.uk', 'interview');
  assert.deepEqual(s.list()[0].occasions, ['wedding', 'interview']);
  await s.add('c@d.com');
  const token = s.list()[0].token;
  assert.equal(await s.remove('nope'), false);
  assert.equal(await s.remove(token), true);
  const reloaded = createSubscribers(file);
  assert.equal(reloaded.count(), 1);
  assert.equal(reloaded.list()[0].email, 'c@d.com');
});

test('email check and CSV escaping', () => {
  assert.ok(validEmail('first.last+tag@example.co.uk'));
  for (const bad of ['', 'a@b', 'a b@c.com', '<x>@y.com', 'x@y.com\nBcc: z@w.com', 'x'.repeat(250) + '@y.com']) assert.ok(!validEmail(bad), bad);
  const csv = toCsv([{ email: '=cmd@x.com', occasions: [], t: 't', token: 'k' }], 'https://s');
  assert.match(csv, /"'=cmd@x.com"/);
});
