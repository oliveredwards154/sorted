// Server-rendered "What to wear to…" guide pages, so search engines (and people without JavaScript)
// get real content for each occasion. Copy lives in data/guides.json; looks come from data/occasions.json.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, config } from './config.js';
import { occasions } from './catalogue.js';
import { verificationMeta } from './html.js';

export const guides = JSON.parse(readFileSync(path.join(ROOT, 'data', 'guides.json'), 'utf8'));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const guidePath = (occId) => (guides[occId] ? `/what-to-wear/${guides[occId].slug}` : null);
export const guideBySlug = (slug) => {
  const id = Object.keys(guides).find((k) => guides[k].slug === slug);
  return id ? { id, guide: guides[id], occasion: occasions.find((o) => o.id === id) } : null;
};

function layout({ title, description, canonical, image, body, jsonLd }) {
  const abs = (u) => (u && u.startsWith('/') ? config.siteUrl + u : u);
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} – ${esc(config.siteName)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(abs(canonical))}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${image ? `<meta property="og:image" content="${esc(abs(image))}">` : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${verificationMeta()}
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/css/site.css">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<header class="site-header"><div class="wrap bar"><a href="/" class="logo">${esc(config.siteName)}</a><nav aria-label="Main"><a href="/">Occasions</a><a href="/what-to-wear">Guides</a><a href="/shops">Shops</a><a href="/wardrobe" class="pill">Wardrobe</a></nav></div></header>
<main id="main" class="wrap">${body}</main>
<footer class="site-footer"><div class="wrap foot"><p class="disclosure">We earn a commission when you buy through some links on this site. It never changes the price you pay. <a href="/affiliate-disclosure">How this works</a></p><nav aria-label="Footer"><a href="/about">About</a><a href="/what-to-wear">Guides</a><a href="/shops">Shops</a><a href="/privacy">Privacy</a><a href="/cookies">Cookies</a><a href="/affiliate-disclosure">Affiliate disclosure</a></nav></div></footer>
<script type="module" src="/js/static.js"></script>
</body>
</html>`;
}

export function renderGuide(slug) {
  const found = guideBySlug(slug);
  if (!found || !found.occasion) return null;
  const { guide: g, occasion: o } = found;
  const others = Object.keys(guides).filter((k) => k !== found.id && occasions.some((x) => x.id === k));
  const body = `<article class="section guide">
  <div class="head">
    <a class="back" href="/what-to-wear">← All guides</a>
    <div class="eyebrow">${esc(o.name)}</div>
    <h1>${esc(g.title)}</h1>
    <p class="lede">${esc(g.intro)}</p>
    <div class="chips"><a class="btn" href="/occasion/${esc(o.id)}/rounds" data-track="guide_play">Find your ${esc(o.lower)} style in three picks</a></div>
  </div>
  <section class="prose">
    <h2>The basics</h2>
    <ul>${g.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    <p><b>Avoid:</b> ${esc(g.avoid)}</p>
  </section>
  <section class="stack" style="gap:20px">
    <h2>Six looks that work</h2>
    <div class="cards">${o.looks.map((l) => `<div class="card">
      <div class="photo"><img src="${esc(l.image)}" alt="${esc(l.alt)}" loading="lazy" width="440" height="600"></div>
      <h3>${esc(l.name)}</h3>
      <p class="meta">${esc(l.line)}</p>
      <ul class="pieces">${l.pieces.map((p) => `<li>${esc(p.name)}</li>`).join('')}</ul>
    </div>`).join('')}</div>
  </section>
  <section class="notice ok">
    <span class="dot">✓</span>
    <span><strong>Not sure which?</strong><span class="muted small">Pick between two looks, three times, and we'll put together one outfit with pieces you can buy from UK shops.</span>
    <a class="btn" style="margin-top:12px" href="/occasion/${esc(o.id)}/rounds" data-track="guide_play">Start</a></span>
  </section>
  ${signupForm(o.id, o.lower)}
  <nav class="stack" aria-label="Other guides"><h2>Other occasions</h2><div class="chips">${others.map((k) => `<a class="chip" href="${guidePath(k)}">${esc(guides[k].title)}</a>`).join('')}</div></nav>
</article>`;
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.description,
    image: o.looks.slice(0, 3).map((l) => config.siteUrl + l.image), mainEntityOfPage: config.siteUrl + guidePath(found.id),
    publisher: { '@type': 'Organization', name: config.siteName },
  };
  return layout({ title: g.title, description: g.description, canonical: guidePath(found.id), image: o.looks[0]?.image, body, jsonLd });
}

export function renderGuideIndex() {
  const list = occasions.filter((o) => guides[o.id]);
  const body = `<section class="section">
  <div class="head"><div class="eyebrow">Guides</div><h1>What to wear to…</h1><p class="lede">Plain advice for the places men most often get stuck on, with six looks for each and pieces from UK shops.</p></div>
  <div class="cards">${list.map((o) => `<a class="card" style="text-decoration:none" href="${guidePath(o.id)}">
    <div class="photo"><img src="${esc(o.looks[0].image)}" alt="${esc(o.looks[0].alt)}" loading="lazy" width="440" height="600"></div>
    <h3>${esc(guides[o.id].title)}</h3><p class="meta">${esc(o.blurb)}</p></a>`).join('')}</div>
</section>`;
  return layout({ title: 'What to wear to…', description: 'Menswear guides by occasion: weddings, job interviews, first dates, the office, the pub and the weekend.', canonical: '/what-to-wear', image: list[0]?.looks[0]?.image, body });
}

export function signupForm(occId = '', lower = '') {
  return `<section class="signup" aria-labelledby="signup-h">
    <h2 id="signup-h">${lower ? `New ${esc(lower)} looks by email` : 'New looks by email'}</h2>
    <p class="muted small">An occasional email with new looks and when shops have them in. No spam. Unsubscribe with one click.</p>
    <form method="post" action="/api/subscribe" class="signup-form" data-signup>
      <input type="hidden" name="occasion" value="${esc(occId)}">
      <label class="sr-only" for="signup-email">Email address</label>
      <input id="signup-email" type="email" name="email" required autocomplete="email" placeholder="you@example.com" maxlength="254">
      <div class="hp" aria-hidden="true"><label>Leave this empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
      <button class="btn" type="submit">Sign up</button>
    </form>
    <p class="muted small">We use your email only for this. See our <a href="/privacy">privacy policy</a>.</p>
    <p class="signup-msg" role="status" aria-live="polite"></p>
  </section>`;
}

export function renderMessage(title, text, status = 200) {
  return { status, html: layout({ title, description: text, canonical: '/', body: `<section class="section"><div class="head"><h1>${esc(title)}</h1><p class="lede">${esc(text)}</p></div><a class="btn" href="/" style="align-self:flex-start">Back to Sorted.</a></section>` }) };
}
