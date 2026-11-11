// Sorted. front end: a small single-page app with plain JavaScript and the History API.
import { ROUNDS, pairFor, buildMix } from './style.js';
import { fingerprintImage, similarity } from './fingerprint.js';
import * as store from './store.js';
import { track, pageView, trackClicks } from './track.js';
import { enhanceSignup, signupHtml } from './signup.js';

const main = document.getElementById('main');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = async (url, opts) => {
  const r = await fetch(url, opts);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.message || 'Request failed'), { status: r.status, body });
  return body;
};

const state = {
  config: null,
  occasions: [],
  upload: null,            // { dataUrl, category, colour, ai }
  picks: {},               // occasionId -> [lookIndex, ...]
};
try { state.picks = JSON.parse(sessionStorage.getItem('sorted.picks') || '{}'); } catch { /* private mode */ }
const savePicks = () => { try { sessionStorage.setItem('sorted.picks', JSON.stringify(state.picks)); } catch { /* ignore */ } };

const SWATCH = { Navy: '#24304a', Black: '#1a1a1c', Grey: '#9c9da0', White: '#f3f3f0', Cream: '#e8e1d1', Stone: '#cbbf9f', Tan: '#a57a4b', Brown: '#6e4b31', Olive: '#5d6244', 'Light blue': '#bccde0', Burgundy: '#6a2632' };
// The ASA/CAP rules want affiliate links labelled where they appear, not only in the footer.
const AD = '<span class="adpill" title="We may earn a commission if you buy">Ad</span>';
const AD_NOTE = '<p class="adnote">Shop links marked <b>Ad</b> are affiliate links: we may earn a commission if you buy. The price you pay is the same.</p>';
const TIERS = { '£': 'Under £40', '££': '£40–£100', '£££': '£100+' };
const CAT_IMG = { Shirt: 'shirt-0', 'T-shirt': 'tee-1', Jumper: 'knit-0', Jacket: 'jacket-0', Trousers: 'trousers-0', Shoes: 'shoes-0' };
const ICON = {
  upload: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>',
  eye: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  heart: (on) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="${on ? '#121316' : 'none'}" stroke="#121316" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>`,
};

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2200);
}
function updateCount() { document.getElementById('savedCount').textContent = store.count(); }
function setTitle(t) { document.title = t ? `${t} – Sorted.` : 'Sorted. – menswear, decided'; }

/* ---------------- routing ---------------- */
function go(url, { replace = false } = {}) {
  if (replace) history.replaceState({}, '', url); else history.pushState({}, '', url);
  render();
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
  e.preventDefault();
  go(a.getAttribute('href'));
});
window.addEventListener('popstate', render);

async function render() {
  const url = new URL(location.href);
  const parts = url.pathname.split('/').filter(Boolean);
  window.scrollTo(0, 0);
  updateCount();
  pageView();
  try {
    if (!parts.length) return home();
    if (parts[0] === 'occasion') {
      const occ = state.occasions.find((o) => o.id === parts[1]);
      if (!occ) return notFound();
      if (!parts[2]) return choose(occ);
      if (parts[2] === 'rounds') return rounds(occ, Number(url.searchParams.get('r') || 1) - 1);
      if (parts[2] === 'style') return style(occ);
      return notFound();
    }
    if (parts[0] === 'upload') return upload(url.searchParams.get('o'));
    if (parts[0] === 'results') return results(url.searchParams);
    if (parts[0] === 'shops') return shops();
    if (parts[0] === 'wardrobe') return wardrobe();
    return notFound();
  } finally {
    main.focus({ preventScroll: true });
  }
}

function notFound() {
  setTitle('Not found');
  main.innerHTML = `<section class="section"><div class="head"><h1>We couldn’t find that page</h1><p class="lede">Start again from the occasions.</p></div><a class="btn" href="/" data-link style="align-self:flex-start">See occasions</a></section>`;
}

/* ---------------- home ---------------- */
function home() {
  setTitle('');
  main.innerHTML = `<section class="section">
    <div class="head">
      <div class="eyebrow">Choose an occasion</div>
      <h1>Where are you going?</h1>
    </div>
    <div class="grid">
      ${state.occasions.map((o, i) => `<a class="occ" href="/occasion/${o.id}" data-link>
        <span class="photo"><img src="${esc(o.looks[0].image)}" alt="" loading="${i < 3 ? 'eager' : 'lazy'}"><span class="tag">${String(i + 1).padStart(2, '0')}</span></span>
        <span class="occ-name">${esc(o.name)}<span aria-hidden="true">→</span></span>
        <span class="muted">${esc(o.blurb)}</span></a>`).join('')}
    </div>
    <a class="linkbtn" href="/what-to-wear">Or read our plain guides: what to wear to a wedding, an interview, a first date and more</a>
  </section>`;
}

/* ---------------- choose ---------------- */
function choose(occ) {
  setTitle(occ.name);
  track('occasion_open', occ.id);
  main.innerHTML = `<section class="section">
    <a class="back" href="/" data-link>← All occasions</a>
    <div class="head"><div class="eyebrow">${esc(occ.name)}</div><h1>How do you want to start?</h1></div>
    <div class="choices">
      <a class="choice dark" href="/occasion/${occ.id}/rounds" data-link>
        <span class="pair">${occ.looks.slice(0, 2).map((l) => `<img src="${esc(l.image)}" alt="">`).join('')}</span>
        <span><h2>Show me some looks</h2><p>Three quick rounds of this or that. Two looks at a time.</p></span>
      </a>
      <a class="choice light" href="/upload?o=${occ.id}" data-link>
        <span class="dropzone">${ICON.upload}A photo of your shirt, jacket, shoes…</span>
        <span><h2>Start from something I own</h2><p>Upload a piece you like. We find similar things to buy.</p></span>
      </a>
    </div>
  </section>`;
}

/* ---------------- rounds ---------------- */
function rounds(occ, r) {
  r = Math.max(0, Math.min(ROUNDS - 1, r || 0));
  const picks = (state.picks[occ.id] || []).slice(0, r);
  if (picks.length < r) return go(`/occasion/${occ.id}/rounds?r=${picks.length + 1}`, { replace: true });
  setTitle(`${occ.name}: round ${r + 1}`);
  const pair = pairFor(occ, r);
  if (r === 0) track('rounds_start', occ.id);
  const lines = ['Two looks. Pick the one that feels most like you.', 'Nice. Two more, same again.', 'Last round. Then we put your style together.'];
  main.innerHTML = `<section class="section">
    <a class="back" href="${r ? `/occasion/${occ.id}/rounds?r=${r}` : `/occasion/${occ.id}`}" data-link>← ${r ? `Round ${r}` : 'Back'}</a>
    <div class="head center">
      <div class="eyebrow">${esc(occ.name)} · Round ${r + 1} of ${ROUNDS}</div>
      <div class="dots" role="progressbar" aria-label="Round" aria-valuemin="1" aria-valuemax="${ROUNDS}" aria-valuenow="${r + 1}">${Array.from({ length: ROUNDS }, (_, i) => `<span class="${i <= r ? 'on' : ''}"></span>`).join('')}</div>
      <h1>This, or that?</h1>
      <p class="lede">${lines[r]}</p>
    </div>
    <div class="pairs">
      ${pair.map((l, j) => `<article class="look">
        <div class="photo"><img src="${esc(l.image)}" alt="${esc(l.alt)}"><span class="tag">Look ${j ? 'B' : 'A'}</span></div>
        <div class="stack" style="gap:4px"><h2>${esc(l.name)}</h2><p class="muted">${esc(l.line)}</p><p class="small">${l.pieces.map((x) => esc(x.name)).join(' · ')}</p></div>
        <button class="btn" data-pick="${2 * r + j}">This one</button>
      </article>`).join('')}
    </div>
    <a class="linkbtn" href="/upload?o=${occ.id}" data-link>Neither? Start from something you own instead</a>
  </section>`;
  main.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
    state.picks[occ.id] = [...picks, Number(b.dataset.pick)];
    track('round_pick', occ.id);
    savePicks();
    go(r < ROUNDS - 1 ? `/occasion/${occ.id}/rounds?r=${r + 2}` : `/occasion/${occ.id}/style`);
  }));
}

/* ---------------- merged style ---------------- */
function resultsUrl(q) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
  return `/results?${p}`;
}

async function style(occ) {
  const picks = state.picks[occ.id] || [];
  if (picks.length < ROUNDS) return go(`/occasion/${occ.id}/rounds?r=${picks.length + 1}`, { replace: true });
  setTitle(`Your ${occ.lower} style`);
  const slots = buildMix(occ, picks);
  const key = `style:${occ.id}:${picks.join(',')}`;
  const saved = store.has('styles', key);
  track('style_done', occ.id);
  main.innerHTML = `<section class="section">
    <a class="back" href="/occasion/${occ.id}/rounds?r=${ROUNDS}" data-link>← Back to round ${ROUNDS}</a>
    <div class="row" style="flex-wrap:wrap;align-items:flex-end;gap:20px">
      <div class="head" style="max-width:680px">
        <div class="eyebrow">${esc(occ.name)} · Your style</div>
        <h1>Here’s what suits you</h1>
        <p class="lede">We merged the pieces from your three picks. A couple of options for each part of the outfit. Tap one to shop it.</p>
      </div>
      <div class="chips"><button class="btn" id="saveStyle">${saved ? 'Saved to wardrobe' : 'Save this style'}</button><a class="btn soft" href="/occasion/${occ.id}/rounds" data-link id="again">Play again</a></div>
    </div>
    ${slots.map((s, si) => `<div class="stack" style="gap:14px">
      <h2 class="label">${esc(s.label)}<span>${s.items.length === 1 ? '1 option' : s.items.length + ' options'}</span></h2>
      <div class="cards">${s.items.map((it, ii) => `<article class="card">
        <div class="photo"><img id="img-${si}-${ii}" src="/images/products/${CAT_IMG[it.category] || 'shirt-0'}.jpg" alt=""></div>
        <div><h3>${esc(it.name.charAt(0).toUpperCase() + it.name.slice(1))}</h3><div class="meta">From ${esc(it.fromLook)}</div></div>
        <a class="btn block" data-link href="${esc(resultsUrl({ category: it.category, text: it.name, colour: it.colour, o: occ.id, from: 'style' }))}">${esc(it.cta)}</a>
      </article>`).join('')}</div></div>`).join('')}
    <a class="linkbtn" href="/upload?o=${occ.id}" data-link>Got something similar already? Start from your own clothes</a>
    ${signupHtml(occ.id, occ.lower)}
  </section>`;
  enhanceSignup(main);
  document.getElementById('again').addEventListener('click', () => { state.picks[occ.id] = []; savePicks(); });
  document.getElementById('saveStyle').addEventListener('click', (e) => {
    const on = store.toggle('styles', { id: key, occasion: occ.id, picks, name: `Your ${occ.lower} style`, image: occ.looks[picks[0]].image });
    e.target.textContent = on ? 'Saved to wardrobe' : 'Save this style';
    if (on) track('style_save', occ.id);
    toast(on ? 'Saved to your wardrobe' : 'Removed from your wardrobe');
    updateCount();
  });
  // Show the best-matching product photo for each piece.
  slots.forEach((s, si) => s.items.forEach(async (it, ii) => {
    try {
      const r = await api(`/api/products?${new URLSearchParams({ category: it.category, text: it.name, colour: it.colour || '', occasion: occ.id, limit: 1 })}`);
      const p = r.results[0];
      const img = document.getElementById(`img-${si}-${ii}`);
      if (p && img) img.src = imgSrc(p.image);
    } catch { /* keep the category photo */ }
  }));
}

const imgSrc = (u) => (/^https?:\/\//.test(u) ? `/img?u=${encodeURIComponent(u)}` : u);

/* ---------------- upload ---------------- */
function upload(occId) {
  const occ = state.occasions.find((o) => o.id === occId) || null;
  setTitle('Start from something you own');
  const u = state.upload || (state.upload = { dataUrl: null, category: 'Shirt', colour: 'Navy', ai: null });
  const cats = state.config.categories, cols = state.config.colours;

  const draw = () => {
    const ai = u.ai;
    let note = '';
    if (ai?.state === 'thinking') note = `<div class="notice" role="status"><span class="dot">${ICON.eye}</span><span><span class="eyebrow" style="color:var(--muted)">Reading your photo</span><strong>Having a look… <span class="spinner"></span></strong><span class="muted small">Usually a few seconds.</span></span></div>`;
    else if (ai?.state === 'done') note = `<div class="notice ok" role="status"><span class="dot">${ICON.eye}</span><span><span class="eyebrow" style="color:var(--muted)">We spotted</span><strong>${esc(cap(ai.name || `${u.colour} ${u.category.toLowerCase()}`))}</strong><span class="muted small">${ai.details?.length ? esc(ai.details.join(' · ')) + '. ' : ''}We’ve set the type and colour below. Change anything we got wrong.</span></span></div>`;
    else if (ai?.state === 'notclothing') note = `<div class="notice" role="status"><span class="dot">${ICON.eye}</span><span><strong>That doesn’t look like clothing</strong><span class="muted small">Try one item, laid flat or on a hanger. Or pick the type and colour yourself.</span></span></div>`;
    else if (ai?.state === 'error') note = `<div class="notice" role="status"><span class="dot">${ICON.eye}</span><span><strong>Tell us what it is below</strong><span class="muted small">${esc(ai.message)}</span></span></div>`;

    main.innerHTML = `<section class="section">
      <a class="back" href="${occ ? `/occasion/${occ.id}` : '/'}" data-link>← Back</a>
      <div class="head"><div class="eyebrow">${esc(occ ? occ.name : 'Find similar')}</div><h1>What have you got?</h1>
        <p class="lede">Show us something you already wear${occ ? ' ' + esc(occ.phrase) : ''}. We find pieces like it at three price levels.</p></div>
      <div class="split">
        <div class="side">
          <div class="upload-photo">${u.dataUrl ? `<img src="${u.dataUrl}" alt="Your photo">` : `<span style="padding:24px">Lay it flat or hang it up, in good light, with the whole item in shot.</span>`}</div>
          <label class="btn ghost file-btn">${ICON.upload.replace('36', '18').replace('36', '18')} ${u.dataUrl ? 'Change photo' : 'Upload a photo'}<input id="file" type="file" accept="image/*"></label>
        </div>
        <div class="main">
          ${note}
          <fieldset><legend>1 · What is it?</legend><div class="cat-grid">${cats.map((c) => `<button class="cat" data-cat="${esc(c)}" aria-pressed="${c === u.category}"><img src="/images/products/${CAT_IMG[c]}.jpg" alt="">${esc(c)}</button>`).join('')}</div></fieldset>
          <fieldset><legend>2 · What colour?</legend><div class="chips">${cols.map((c) => `<button class="chip" data-col="${esc(c)}" aria-pressed="${c === u.colour}"><span class="swatch" style="background:${SWATCH[c]}"></span>${esc(c)}</button>`).join('')}</div></fieldset>
          <p class="muted small" style="margin:0">${state.config.recognition ? 'Upload a photo and we’ll fill these in for you, or pick them yourself.' : 'Pick the type and colour. We’ll also compare your photo with each item.'}</p>
          <button class="btn" id="find" style="align-self:flex-start">${u.dataUrl ? 'Find similar to my photo' : 'Find similar'}</button>
        </div>
      </div>
    </section>`;

    main.querySelector('#file').addEventListener('change', onFile);
    main.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { u.category = b.dataset.cat; draw(); }));
    main.querySelectorAll('[data-col]').forEach((b) => b.addEventListener('click', () => { u.colour = b.dataset.col; draw(); }));
    main.querySelector('#find').addEventListener('click', async () => {
      const text = u.ai?.state === 'done' && u.ai.name ? u.ai.name : `${u.colour} ${u.category}`;
      if (u.dataUrl) {
        try {
          const thumb = await store.thumbnail(u.dataUrl);
          const w = store.load();
          const id = `${u.category}:${u.colour}:${thumb.length}`;
          if (!w.clothes.some((x) => x.id === id)) { w.clothes.unshift({ id, name: cap(text), category: u.category, colour: u.colour, image: thumb, occasion: occ?.name || null, savedAt: Date.now() }); w.clothes = w.clothes.slice(0, 30); store.save(w); }
        } catch { /* saving is optional */ }
      }
      go(resultsUrl({ category: u.category, text, colour: u.colour, o: occ?.id, from: 'upload' }));
    });
  };

  async function onFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 12 * 1024 * 1024) { toast('That photo is over 12MB. Try a smaller one.'); return; }
    u.dataUrl = await store.thumbnail(await readAsDataUrl(f), 1200);
    u.ai = state.config.recognition ? { state: 'thinking' } : null;
    track('upload_start', occId || '');
    draw();
    if (!state.config.recognition) return;
    const mine = (u.token = (u.token || 0) + 1);
    try {
      const out = await api('/api/recognise', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: u.dataUrl }) });
      if (mine !== u.token) return;
      if (!out.isClothing) u.ai = { state: 'notclothing' };
      else { track('upload_done', occId || ''); u.ai = { state: 'done', ...out }; if (out.category) u.category = out.category; if (out.colour) u.colour = out.colour; }
    } catch (err) {
      if (mine !== u.token) return;
      u.ai = { state: 'error', message: err.body?.message || 'We couldn’t read that photo. Pick the type and colour yourself.' };
    }
    draw();
  }
  draw();
}
const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const readAsDataUrl = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });

/* ---------------- results ---------------- */
async function results(params) {
  const category = params.get('category');
  const text = params.get('text') || '';
  const colour = params.get('colour') || '';
  const occId = params.get('o') || '';
  const from = params.get('from') || '';
  const tier = params.get('tier') || '';
  const occ = state.occasions.find((o) => o.id === occId);
  if (!tier) track('results_view', occId);
  if (!state.config.categories.includes(category)) return notFound();
  setTitle(`Shop ${text || category}`);
  const back = from === 'style' && occ ? { href: `/occasion/${occ.id}/style`, label: 'Back to your style' }
    : from === 'upload' ? { href: `/upload${occ ? '?o=' + occ.id : ''}`, label: 'Change item' } : { href: '/', label: 'Occasions' };
  const usingPhoto = from === 'upload' && state.upload?.dataUrl;

  main.innerHTML = `<section class="section"><a class="back" href="${back.href}" data-link>← ${esc(back.label)}</a>
    <div class="row" style="flex-wrap:wrap;justify-content:flex-start;gap:24px;align-items:center">
      ${usingPhoto ? `<img src="${state.upload.dataUrl}" alt="Your item" style="width:96px;height:120px;object-fit:cover;border-radius:4px">` : ''}
      <div class="head"><div class="eyebrow">${esc(occ ? occ.name + ' · ' : '')}${esc(category)}</div><h1 style="font-size:clamp(32px,4.6vw,52px)">${usingPhoto ? 'Similar to your ' : 'Shop '}${esc(text.toLowerCase())}</h1><p class="muted" id="matchNote" style="margin:0"></p></div>
    </div><div id="res"><p class="empty">Finding pieces…</p></div></section>`;

  let data;
  try {
    data = await api(`/api/products?${new URLSearchParams({ category, text, colour, occasion: occId, tier, limit: 12 })}`);
  } catch (err) {
    document.getElementById('res').innerHTML = `<p class="empty">${esc(err.message)}. Try again.</p>`;
    return;
  }
  let list = data.results;
  const preview = data.source === 'preview';

  const draw = (scores) => {
    const filters = preview ? '' : `<div class="filters"><div class="chips" role="group" aria-label="Price">${['', '£', '££', '£££'].map((t) => `<a class="chip" data-link aria-pressed="${t === tier}" href="${esc(resultsUrl({ category, text, colour, o: occId, from, tier: t }))}">${t || 'All'}</a>`).join('')}</div><span class="muted small">£ under £40 · ££ £40–£100 · £££ £100+</span></div>`;
    const cards = list.map((p, i) => {
      const fav = store.has('finds', p.id);
      return `<article class="card">
        <div class="photo"><img src="${esc(imgSrc(p.image))}" alt="${esc(p.name)}" loading="lazy">
          ${i === 0 ? '<span class="badge">Best match</span>' : ''}${p.preview ? '<span class="tag" style="top:auto;bottom:12px">Example</span>' : ''}
          <button class="heart" data-fav="${esc(p.id)}" aria-label="${fav ? 'Remove from' : 'Save to'} wardrobe">${ICON.heart(fav)}</button></div>
        <div class="row"><h3>${esc(p.name)}</h3>${p.price ? `<span class="price">£${p.price.toFixed(2)}</span>` : (p.tier ? `<span class="price">${p.tier}</span>` : '')}</div>
        <div class="meta">${[scores ? Math.round(scores[p.id] * 100) + '% match' : '', p.brand, p.tier && !preview ? TIERS[p.tier] : '', p.inStock ? '' : 'Out of stock'].filter(Boolean).map(esc).join(' · ') || (p.preview ? 'Example item' : '')}</div>
        ${preview ? '' : `<a class="btn block" href="/go/p/${encodeURIComponent(p.id)}?o=${encodeURIComponent(occId)}" target="_blank" rel="sponsored noopener">Shop at ${esc(p.brand || 'the shop')} ↗ ${AD}</a>`}
      </article>`;
    }).join('');
    const shopsList = preview && data.shops?.length ? `<div class="stack" style="gap:14px;margin-top:40px">
      <h2 class="label">Where to buy ${esc(text.toLowerCase() || category.toLowerCase())}<span>£ to £££</span></h2>${AD_NOTE}
      <div class="tiers">${['£', '££', '£££'].map((t) => { const s = data.shops.filter((b) => b.tier === t); return s.length ? `<div>${s.slice(0, 4).map((b) => `<a class="shop" href="/go/b/${b.id}?o=${encodeURIComponent(occId)}" target="_blank" rel="sponsored noopener"><b>${esc(b.name)}<span aria-hidden="true">↗</span> ${AD}</b><span>${esc(b.notes)}</span></a>`).join('')}</div>` : ''; }).join('')}</div></div>` : '';
    const previewNote = preview ? `<div class="notice"><span class="dot">i</span><span><strong>Preview catalogue</strong><span class="muted small">These are example items to show how matching works. Once partner product feeds are connected, real products, prices and buy links appear here.</span></span></div>` : '';
    document.getElementById('res').innerHTML = `<div class="stack" style="gap:24px">${previewNote}${filters}${list.length ? `${preview ? '' : AD_NOTE}<div class="cards">${cards}</div>` : '<p class="empty">Nothing at that price yet. Try another.</p>'}${shopsList}</div>`;
    document.querySelectorAll('[data-fav]').forEach((b) => b.addEventListener('click', () => {
      const p = list.find((x) => x.id === b.dataset.fav);
      const on = store.toggle('finds', { id: p.id, name: p.name, image: p.image, brand: p.brand, price: p.price, tier: p.tier, preview: p.preview });
      b.innerHTML = ICON.heart(on); b.setAttribute('aria-label', `${on ? 'Remove from' : 'Save to'} wardrobe`);
      toast(on ? 'Saved to your wardrobe' : 'Removed'); updateCount();
    }));
  };
  draw(null);

  // Re-rank by how closely each product photo matches the uploaded photo.
  if (usingPhoto && list.length) {
    const note = document.getElementById('matchNote');
    note.textContent = 'Comparing your photo with each item…';
    try {
      const mine = await fingerprintImage(state.upload.dataUrl);
      const maxScore = Math.max(8, ...list.map((p) => p.score || 0));
      const scores = {};
      for (const p of list) {
        try { scores[p.id] = 0.6 * similarity(mine, await fingerprintImage(imgSrc(p.image))) + 0.4 * ((p.score || 0) / maxScore); }
        catch { scores[p.id] = 0.4 * ((p.score || 0) / maxScore); }
      }
      list = [...list].sort((a, b) => scores[b.id] - scores[a.id]);
      draw(scores);
      document.getElementById('matchNote').textContent = 'Ranked by how closely each item’s colours, tone and texture match your photo.';
    } catch {
      note.textContent = 'We couldn’t compare photos here, so these are ranked by type and colour.';
    }
  }
}

/* ---------------- shops ---------------- */
async function shops() {
  setTitle('Shops');
  main.innerHTML = `<section class="section"><div class="head"><div class="eyebrow">Where we look</div><h1>Shops, by budget</h1>
    <p class="lede">We search UK menswear shops at three price levels. When you buy through our links we may earn a commission; the price you pay is the same.</p></div><div id="shopList"><p class="empty">Loading shops…</p></div></section>`;
  const list = await api('/api/brands').catch(() => []);
  document.getElementById('shopList').innerHTML = `${AD_NOTE}<div class="tiers">${['£', '££', '£££'].map((t) => `<div>
    <h2 class="label">${t}<span>${TIERS[t]}</span></h2>
    ${list.filter((b) => b.tier === t).sort((a, b) => a.name.localeCompare(b.name)).map((b) => `<a class="shop" href="/go/b/${b.id}" target="_blank" rel="sponsored noopener"><b>${esc(b.name)}<span aria-hidden="true">↗</span> ${AD}</b><span>${esc(b.notes)}</span></a>`).join('')}
  </div>`).join('')}</div>`;
}

/* ---------------- wardrobe ---------------- */
function wardrobe() {
  setTitle('Your wardrobe');
  const w = store.load();
  const block = (title, items, emptyText, render) => `<div class="stack" style="gap:16px"><h2 class="label">${title}<span>${items.length}</span></h2>${items.length ? `<div class="cards">${items.map(render).join('')}</div>` : `<p class="empty" style="padding:0">${emptyText}</p>`}</div>`;
  main.innerHTML = `<section class="section">
    <div class="head"><div class="eyebrow">Saved on this device</div><h1>Your wardrobe</h1><p class="lede">Everything here is stored in this browser only.</p>${w.finds.some((f) => !f.preview) ? AD_NOTE : ''}</div>
    ${block('Saved styles', w.styles, 'No styles yet. Pick an occasion and play the rounds.', (s) => `<a class="card" href="/occasion/${esc(s.occasion)}/style" data-link data-style="${esc(s.id)}" style="text-decoration:none"><div class="photo"><img src="${esc(s.image)}" alt=""></div><h3>${esc(s.name)}</h3></a>`)}
    ${block('Your clothes', w.clothes, 'Nothing uploaded yet. Pieces you search from land here.', (c) => `<a class="card" style="text-decoration:none" data-link href="${esc(resultsUrl({ category: c.category, text: c.name, colour: c.colour }))}"><div class="photo"><img src="${esc(c.image)}" alt="${esc(c.name)}"></div><h3>${esc(c.name)}</h3><div class="meta">${esc(c.occasion || '')}</div></a>`)}
    ${block('Saved finds', w.finds, 'Nothing saved yet. Tap the heart on any match.', (f) => `<div class="card"><div class="photo"><img src="${esc(imgSrc(f.image))}" alt=""></div><div class="row"><h3>${esc(f.name)}</h3><span class="price">${f.price ? '£' + f.price.toFixed(2) : esc(f.tier || '')}</span></div><div class="meta">${esc(f.brand || (f.preview ? 'Example item' : ''))}</div>${f.preview ? '' : `<a class="btn ghost block" href="/go/p/${encodeURIComponent(f.id)}" target="_blank" rel="sponsored noopener">Shop ↗ ${AD}</a>`}</div>`)}
    ${store.count(w) ? '<button class="linkbtn" id="clear">Clear my wardrobe</button>' : ''}
  </section>`;
  main.querySelectorAll('[data-style]').forEach((a) => a.addEventListener('click', () => {
    const s = w.styles.find((x) => x.id === a.dataset.style);
    if (s) { state.picks[s.occasion] = s.picks; savePicks(); }
  }));
  const clear = document.getElementById('clear');
  if (clear) clear.addEventListener('click', () => {
    if (clear.dataset.sure) { store.save({ styles: [], finds: [], clothes: [] }); toast('Wardrobe cleared'); wardrobe(); updateCount(); }
    else { clear.dataset.sure = '1'; clear.textContent = 'Tap again to clear everything'; }
  });
}

/* ---------------- boot ---------------- */
(async () => {
  try {
    [state.config, state.occasions] = await Promise.all([api('/api/config'), api('/api/occasions')]);
  } catch {
    main.innerHTML = '<p class="lede">Sorted. couldn’t load. Check your connection and reload the page.</p>';
    return;
  }
  trackClicks();
  render();
})();
