// Pure functions for the "this or that" rounds and the merged style. No DOM here, so they can be unit-tested.

export const ROUNDS = 3;

const COLOUR_WORDS = {
  grey: 'Grey', charcoal: 'Grey', black: 'Black', white: 'White', 'off-white': 'White', cream: 'Cream',
  stone: 'Stone', khaki: 'Stone', tan: 'Tan', camel: 'Tan', rust: 'Tan', brown: 'Brown', olive: 'Olive',
  navy: 'Navy', blue: 'Light blue', 'light-wash': 'Light blue', denim: 'Navy', burgundy: 'Burgundy', red: 'Burgundy',
};

export function colourOf(text) {
  for (const w of String(text || '').toLowerCase().split(/[\s,]+/)) if (COLOUR_WORDS[w]) return COLOUR_WORDS[w];
  return null;
}

export function plural(name) {
  const n = String(name).toLowerCase().replace('t-shirt', 'T-shirt').replace('oxford', 'Oxford').replace('chelsea', 'Chelsea').replace('derbies', 'Derbies');
  return /s$/.test(n) ? n : n + 's';
}

export const SLOTS = [
  { id: 'outer', label: 'Outer layer' },
  { id: 'top', label: 'Top' },
  { id: 'bottoms', label: 'Bottoms' },
  { id: 'shoes', label: 'Shoes' },
];

export function slotOfPart(part) {
  if (/^(Layer|Jacket|Suit|Coat)$/.test(part)) return 'outer';
  if (part === 'Bottoms') return 'bottoms';
  if (part === 'Shoes') return 'shoes';
  return 'top';
}

/** The two looks shown in a round: looks 0-1, then 2-3, then 4-5. */
export function pairFor(occasion, round) {
  const r = Math.max(0, Math.min(ROUNDS - 1, round));
  return [occasion.looks[2 * r], occasion.looks[2 * r + 1]].filter(Boolean);
}

/**
 * Merges the pieces from the looks someone picked into one outfit plan,
 * with up to two options for each part of the outfit.
 * @param {object} occasion  an entry from data/occasions.json
 * @param {number[]} picks   indexes into occasion.looks, one per round
 */
export function buildMix(occasion, picks) {
  const slots = Object.fromEntries(SLOTS.map((s) => [s.id, []]));
  const seen = new Set();
  for (const i of picks) {
    const look = occasion.looks[i];
    if (!look) continue;
    for (const piece of look.pieces) {
      const slot = slotOfPart(piece.part);
      const key = piece.name.toLowerCase();
      if (seen.has(key) || slots[slot].length >= 2) continue;
      seen.add(key);
      slots[slot].push({
        name: piece.name,
        category: piece.category,
        colour: colourOf(piece.name),
        fromLook: look.name,
        cta: 'Shop ' + plural(piece.name),
      });
    }
  }
  return SLOTS.map((s) => ({ ...s, items: slots[s.id] })).filter((s) => s.items.length);
}
