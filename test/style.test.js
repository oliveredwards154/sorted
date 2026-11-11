import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMix, pairFor, plural, ROUNDS } from '../public/js/style.js';
import { fingerprintFromPixels, similarity } from '../public/js/fingerprint.js';
import { search } from '../src/catalogue.js';

const occasions = JSON.parse(readFileSync(new URL('../data/occasions.json', import.meta.url)));

test('every occasion has enough looks for all rounds, and every look has an image file', () => {
  for (const o of occasions) {
    assert.ok(o.looks.length >= ROUNDS * 2, `${o.id} has ${o.looks.length} looks`);
    for (const l of o.looks) readFileSync(new URL(`../public${l.image}`, import.meta.url));
  }
});

test('rounds show looks in pairs', () => {
  const pub = occasions.find((o) => o.id === 'pub');
  assert.deepEqual(pairFor(pub, 1).map((l) => l.id), [pub.looks[2].id, pub.looks[3].id]);
});

test('the merged style has at most two options per slot and no repeats', () => {
  for (const o of occasions) {
    const slots = buildMix(o, [0, 2, 4]);
    const names = slots.flatMap((s) => s.items.map((i) => i.name.toLowerCase()));
    assert.equal(new Set(names).size, names.length);
    for (const s of slots) assert.ok(s.items.length >= 1 && s.items.length <= 2);
  }
});

test('pub picks give a brown overshirt and light grey trousers', () => {
  const pub = occasions.find((o) => o.id === 'pub');
  const slots = buildMix(pub, [0, 2, 4]);
  const all = slots.flatMap((s) => s.items);
  assert.ok(all.some((i) => i.name === 'Dark brown overshirt' && i.cta === 'Shop dark brown overshirts'));
  assert.ok(all.some((i) => i.name === 'Light grey trousers' && i.colour === 'Grey'));
});

test('plural labels read naturally', () => {
  assert.equal(plural('Light grey trousers'), 'light grey trousers');
  assert.equal(plural('White crew-neck T-shirt'), 'white crew-neck T-shirts');
});

test('searching for light grey trousers ranks trousers above jeans', () => {
  const { results } = search({ category: 'Trousers', text: 'Light grey trousers', colour: 'Grey', limit: 4 });
  assert.ok(results.length > 0);
  assert.match(results[0].name, /trousers/i);
  assert.doesNotMatch(results[0].name, /jeans/i);
});

test('visual fingerprint: identical images match best', () => {
  const solid = (r, g, b) => { const d = new Uint8ClampedArray(8 * 8 * 4); for (let i = 0; i < d.length; i += 4) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; } return fingerprintFromPixels(d, 8, 8); };
  const navy = solid(36, 48, 74), navy2 = solid(38, 50, 78), tan = solid(165, 122, 75);
  assert.ok(similarity(navy, navy2) > similarity(navy, tan));
  assert.ok(similarity(navy, navy) > 0.99);
});

test('every affiliate link in the app carries an Ad label (ASA/CAP)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
  const links = src.match(/rel="sponsored noopener">[\s\S]*?<\/a>/g) || [];
  assert.ok(links.length >= 4);
  for (const l of links) assert.match(l, /\$\{AD\}/, l.slice(0, 80));
});
