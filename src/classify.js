// Works out what a product is from its name and the shop's own category text.
// Feeds from different shops describe things differently, so this is deliberately forgiving.

export const CATEGORIES = ['Shirt', 'T-shirt', 'Jumper', 'Jacket', 'Trousers', 'Shoes'];
export const COLOURS = ['Navy', 'Black', 'Grey', 'White', 'Cream', 'Stone', 'Tan', 'Brown', 'Olive', 'Light blue', 'Burgundy'];
export const OCCASIONS = ['pub', 'wedding', 'interview', 'casual', 'date', 'office'];

// Order matters: the first rule that matches wins, so specific words come before general ones.
const CATEGORY_RULES = [
  ['Shoes', /\b(shoe|shoes|trainer|trainers|sneaker|sneakers|boot|boots|loafer|loafers|brogue|brogues|derby|derbies|oxford shoes?|oxfords|chelsea boots?|sandal|plimsoll|espadrille|footwear|mules?)\b/],
  ['Trousers', /\b(trouser|trousers|jeans?|chino|chinos|denim pants?|pants|joggers?|cargo|cords|corduroy trousers|slacks)\b/],
  ['Jacket', /\b(jacket|blazer|coat|overcoat|parka|gilet|bomber|harrington|suit jacket|waistcoat|anorak|shacket|trucker|peacoat|mac|raincoat|puffer)\b/],
  ['Jumper', /\b(jumper|sweater|knit|knitwear|cardigan|crew ?neck sweat|sweatshirt|hoodie|roll ?neck|turtle ?neck|half ?zip|quarter ?zip|pullover)\b/],
  ['T-shirt', /\b(t-?shirt|tee|tees|polo|henley|vest|tank)\b/],
  ['Shirt', /\b(shirt|shirts|overshirt|oxford shirt|button[- ]down)\b/],
];

const COLOUR_WORDS = {
  navy: 'Navy', 'dark blue': 'Navy', indigo: 'Navy', denim: 'Navy', 'dark wash': 'Navy', 'raw denim': 'Navy',
  black: 'Black', jet: 'Black', onyx: 'Black',
  grey: 'Grey', gray: 'Grey', charcoal: 'Grey', silver: 'Grey', marl: 'Grey', slate: 'Grey',
  white: 'White', 'off-white': 'White', 'off white': 'White', optic: 'White',
  cream: 'Cream', ecru: 'Cream', ivory: 'Cream', oatmeal: 'Cream', natural: 'Cream',
  stone: 'Stone', khaki: 'Stone', sand: 'Stone', beige: 'Stone',
  tan: 'Tan', camel: 'Tan', rust: 'Tan', cognac: 'Tan', caramel: 'Tan', mustard: 'Tan',
  brown: 'Brown', chocolate: 'Brown', 'dark brown': 'Brown', walnut: 'Brown', mocha: 'Brown',
  olive: 'Olive', green: 'Olive', sage: 'Olive', forest: 'Olive', bottle: 'Olive',
  'light blue': 'Light blue', 'pale blue': 'Light blue', 'sky blue': 'Light blue', blue: 'Light blue', 'light wash': 'Light blue', chambray: 'Light blue',
  burgundy: 'Burgundy', wine: 'Burgundy', oxblood: 'Burgundy', maroon: 'Burgundy', red: 'Burgundy',
};
const COLOUR_KEYS = Object.keys(COLOUR_WORDS).sort((a, b) => b.length - a.length);

export function detectCategory(...texts) {
  const t = texts.filter(Boolean).join(' ').toLowerCase();
  for (const [cat, re] of CATEGORY_RULES) if (re.test(t)) return cat;
  return null;
}

export function detectColour(...texts) {
  const t = ' ' + texts.filter(Boolean).join(' ').toLowerCase().replace(/[^a-z\- ]/g, ' ') + ' ';
  for (const k of COLOUR_KEYS) if (t.includes(' ' + k + ' ')) return COLOUR_WORDS[k];
  return null;
}

export function tierFromPrice(price) {
  if (typeof price !== 'number' || !isFinite(price) || price <= 0) return null;
  if (price < 40) return '£';
  if (price <= 100) return '££';
  return '£££';
}

// Which part of an outfit a category fills on the "your style" page.
export function slotFor(category) {
  return { Jacket: 'outer', Shirt: 'top', 'T-shirt': 'top', Jumper: 'top', Trousers: 'bottoms', Shoes: 'shoes' }[category] || 'top';
}

// First-pass occasion tags from the product name. Good enough to start; correct by hand later.
const OCCASION_RULES = [
  ['wedding', /\b(suit|blazer|waistcoat|tuxedo|dinner jacket|oxford shoe|oxfords|brogue|derby|tie|formal|linen blazer|morning)\b/],
  ['interview', /\b(suit|blazer|formal shirt|oxford shirt|poplin|tie|oxfords|derby|derbies|smart trousers|tailored)\b/],
  ['office', /\b(shirt|oxford|chino|chinos|blazer|knit|merino|cardigan|loafer|derby|tailored|trousers|polo)\b/],
  ['date', /\b(leather jacket|overcoat|roll ?neck|merino|suede|chelsea|loafer|knitted polo|slim|black jeans|overshirt)\b/],
  ['pub', /\b(overshirt|shacket|jeans|knit|jumper|sweatshirt|flannel|chambray|t-?shirt|trainers?|boots?|cord)\b/],
  ['casual', /\b(t-?shirt|tee|jeans|hoodie|sweatshirt|trainers?|sneakers?|overshirt|jacket|shorts|joggers?|fleece|denim)\b/],
];

export function tagOccasions(...texts) {
  const t = texts.filter(Boolean).join(' ').toLowerCase();
  const tags = OCCASION_RULES.filter(([, re]) => re.test(t)).map(([o]) => o);
  return tags.length ? tags : ['casual'];
}
