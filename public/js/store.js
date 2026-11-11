// The wardrobe lives in this browser only (localStorage). Nothing is sent to our server.
const KEY = 'sorted.wardrobe.v1';
const empty = () => ({ styles: [], finds: [], clothes: [] });

export function load() {
  try { return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return empty(); }
}

export function save(w) {
  try { localStorage.setItem(KEY, JSON.stringify(w)); return true; } catch { return false; }
}

export function count(w = load()) {
  return w.styles.length + w.finds.length + w.clothes.length;
}

export function toggle(list, item, key = 'id') {
  const w = load();
  const i = w[list].findIndex((x) => x[key] === item[key]);
  if (i >= 0) w[list].splice(i, 1); else w[list].unshift({ ...item, savedAt: Date.now() });
  w[list] = w[list].slice(0, 60);
  save(w);
  return i < 0;
}

export function has(list, id, key = 'id') {
  return load()[list].some((x) => x[key] === id);
}

// Uploaded photos are shrunk before saving so the wardrobe stays small.
export async function thumbnail(dataUrl, max = 360) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}
