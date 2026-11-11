// Compares an uploaded photo with product photos by colour make-up, brightness and texture.
// A simple stand-in for a trained image model: good at "same colour and tone", weak on cut and shape.

export function fingerprintFromPixels(data, width, height) {
  const N = width * height;
  const hist = new Array(16).fill(0);
  const L = new Float32Array(N);
  let lum = 0;
  for (let i = 0, n = 0; i < data.length; i += 4, n++) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx ? (mx - mn) / mx : 0;
    let h = 0;
    if (mx !== mn) {
      if (mx === r) h = ((g - b) / (mx - mn)) % 6;
      else if (mx === g) h = (b - r) / (mx - mn) + 2;
      else h = (r - g) / (mx - mn) + 4;
      h = (h * 60 + 360) % 360;
    }
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    L[n] = l; lum += l;
    if (sat > 0.18 && mx > 0.12) hist[Math.min(11, Math.floor(h / 30))] += 1;
    else hist[12 + Math.min(3, Math.floor(mx * 4))] += 1;
  }
  let grad = 0;
  for (let y = 0; y < height - 1; y++) for (let x = 0; x < width - 1; x++) {
    const k = y * width + x;
    grad += Math.abs(L[k] - L[k + 1]) + Math.abs(L[k] - L[k + width]);
  }
  return { hist: hist.map((v) => v / N), lum: lum / N, tex: Math.min(1, grad / (N * 0.25)) };
}

export function similarity(a, b) {
  let inter = 0;
  for (let i = 0; i < 16; i++) inter += Math.min(a.hist[i], b.hist[i]);
  return 0.7 * inter + 0.18 * (1 - Math.abs(a.lum - b.lum)) + 0.12 * (1 - Math.abs(a.tex - b.tex));
}

// Browser only: draws the middle of the image small and fingerprints it.
export async function fingerprintImage(src) {
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('image'));
    im.src = src;
  });
  const W = 48, H = 64;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  const iw = img.naturalWidth, ih = img.naturalHeight;
  x.drawImage(img, iw * 0.15, ih * 0.15, iw * 0.7, ih * 0.7, 0, 0, W, H);
  return fingerprintFromPixels(x.getImageData(0, 0, W, H).data, W, H);
}
