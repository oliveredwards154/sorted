import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/feeds/csv.js';
import { readAwinCsv } from '../src/feeds/awin.js';
import { normaliseProduct, makeBrandMatcher } from '../src/feeds/normalise.js';
import { detectCategory, detectColour, tierFromPrice } from '../src/classify.js';

test('CSV parser handles quotes, commas and newlines inside fields', () => {
  const rows = [...parseCsv('a,b,c\n1,"two, 2","line\nbreak"\n"say ""hi""",x,\n')];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].b, 'two, 2');
  assert.equal(rows[0].c, 'line\nbreak');
  assert.equal(rows[1].a, 'say "hi"');
  assert.equal(rows[1].c, '');
});

const AWIN = [
  'aw_product_id,product_name,merchant_id,merchant_name,aw_deep_link,merchant_deep_link,search_price,currency,aw_image_url,merchant_category,category_name,colour,in_stock,brand_name',
  '1001,Men\'s Light Grey Wool Trousers,1402,Marks & Spencer,https://www.awin1.com/pclick.php?p=1001&a=123&m=1402,https://www.marksandspencer.com/p/1001,45.00,GBP,https://images.example.com/1001.jpg,Mens > Trousers,Trousers,Light Grey,1,M&S Collection',
  '1002,Women\'s Floral Dress,1402,Marks & Spencer,https://www.awin1.com/x,https://www.marksandspencer.com/p/1002,35.00,GBP,https://images.example.com/1002.jpg,Womens > Dresses,Dresses,Blue,1,',
  '1003,Navy Oxford Shirt,1402,Marks & Spencer,https://www.awin1.com/y,https://www.marksandspencer.com/p/1003,25,GBP,https://images.example.com/1003.jpg,Mens > Shirts,Shirts,Navy,0,',
].join('\n');

test('Awin feed rows become Sorted products; womenswear is dropped', () => {
  const brands = [{ id: 'marks-spencer', name: 'Marks & Spencer', affiliate: { network: 'Awin', advertiserId: '1402' } }];
  const match = makeBrandMatcher(brands);
  const products = [...readAwinCsv(AWIN)].map((r) => normaliseProduct(r, match)).filter(Boolean);
  assert.equal(products.length, 2);
  const [trousers, shirt] = products;
  assert.equal(trousers.category, 'Trousers');
  assert.equal(trousers.colour, 'Grey');
  assert.equal(trousers.tier, '££');
  assert.equal(trousers.brandId, 'marks-spencer');
  assert.equal(trousers.url, 'https://www.marksandspencer.com/p/1001');
  assert.ok(trousers.affiliateUrl.startsWith('https://www.awin1.com/'));
  assert.equal(shirt.category, 'Shirt');
  assert.equal(shirt.inStock, false);
  assert.equal(shirt.tier, '£');
});

test('brand matching falls back to the shop name', () => {
  const match = makeBrandMatcher([{ id: 'reiss', name: 'Reiss', affiliate: { network: 'Partnerize' } }]);
  assert.equal(match({ network: 'Awin', advertiserId: '9', merchantName: 'REISS UK' })?.id, 'reiss');
});

test('category and colour detection', () => {
  assert.equal(detectCategory('Tan Suede Chelsea Boots'), 'Shoes');
  assert.equal(detectCategory('Slim Fit Stretch Chinos'), 'Trousers');
  assert.equal(detectCategory('Wool Overcoat'), 'Jacket');
  assert.equal(detectCategory('Merino Crew Neck Jumper'), 'Jumper');
  assert.equal(detectCategory('Pique Polo'), 'T-shirt');
  assert.equal(detectCategory('Brushed Cotton Overshirt'), 'Shirt');
  assert.equal(detectCategory('Leather Wallet'), null);
  assert.equal(detectColour('Charcoal Marl'), 'Grey');
  assert.equal(detectColour('Off-White Linen Shirt'), 'White');
  assert.equal(detectColour('Camel coat'), 'Tan');
  assert.equal(tierFromPrice(39.99), '£');
  assert.equal(tierFromPrice(100), '££');
  assert.equal(tierFromPrice(149), '£££');
  assert.equal(tierFromPrice(0), null);
});
