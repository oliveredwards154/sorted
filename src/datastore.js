// Small file-backed stores for the two things we keep on our own server:
//   1. Anonymous usage counts (no cookies, no IPs, no per-person IDs): "how many people played the wedding rounds today".
//   2. Email sign-ups, with a one-click unsubscribe token.
// Files live in DATA_DIR. On Railway, mount a volume there or they are wiped on each deploy.
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

// ---------- Analytics ----------
export const EVENTS = ['page_view', 'occasion_open', 'rounds_start', 'round_pick', 'style_done', 'style_save', 'upload_start',
  'upload_done', 'results_view', 'shop_click', 'guide_play', 'signup'];

const ROUTES = [
  [/^\/$/, '/'], [/^\/occasion\/[a-z]+$/, '/occasion'], [/^\/occasion\/[a-z]+\/rounds$/, '/rounds'], [/^\/occasion\/[a-z]+\/style$/, '/style'],
  [/^\/what-to-wear(\/[a-z-]+)?$/, null], [/^\/(upload|results|shops|wardrobe|about|privacy|cookies|affiliate-disclosure)$/, null],
];

/** Collapse a path to a small fixed set, so nothing personal (or unbounded) ends up in the counts. */
export function pagePath(p) {
  for (const [re, label] of ROUTES) if (re.test(p)) return label || p;
  return 'other';
}

/** Keep only the referring site's host, and only if it isn't us. */
export function refHost(ref, ownHost = '') {
  try {
    const h = new URL(ref).hostname.replace(/^www\./, '').toLowerCase();
    if (!h || h === ownHost.replace(/^www\./, '') || h === 'localhost' || /^[\d.]+$/.test(h)) return '';
    return h.slice(0, 60);
  } catch { return ''; }
}

export function createStats(file) {
  let data = {};
  if (file && existsSync(file)) { try { data = JSON.parse(readFileSync(file, 'utf8')); } catch { data = {}; } }
  let dirty = false;

  const bump = (day, key) => {
    const d = (data[day] ||= {});
    if (!(key in d) && Object.keys(d).length > 2000) return; // hard cap per day
    d[key] = (d[key] || 0) + 1;
    dirty = true;
  };

  return {
    /** @param {{e:string, o?:string, p?:string, r?:string}} ev */
    record(ev, now = new Date()) {
      if (!EVENTS.includes(ev.e)) return false;
      const day = now.toISOString().slice(0, 10);
      bump(day, ev.e);
      if (ev.o && /^[a-z]{2,20}$/.test(ev.o)) bump(day, `${ev.e}:${ev.o}`);
      if (ev.e === 'page_view' && ev.p) bump(day, `page:${pagePath(ev.p)}`);
      if (ev.r) bump(day, `from:${ev.r}`);
      return true;
    },
    days: () => data,
    summary(nDays = 30, now = new Date()) {
      const out = {};
      for (let i = 0; i < nDays; i++) {
        const day = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
        for (const [k, v] of Object.entries(data[day] || {})) out[k] = (out[k] || 0) + v;
      }
      return out;
    },
    flush() {
      if (!dirty || !file) return;
      try {
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file + '.tmp', JSON.stringify(data));
        renameSync(file + '.tmp', file);
        dirty = false;
      } catch (e) { console.error('Could not save stats:', e.message); }
    },
  };
}

// ---------- Email sign-ups ----------
const EMAIL = /^[^\s@<>()",;:]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
export const validEmail = (e) => typeof e === 'string' && e.length <= 254 && EMAIL.test(e.trim());

export function createSubscribers(file) {
  const byEmail = new Map(); // email -> { email, occasions:Set, t, token }
  const byToken = new Map();
  if (file && existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { apply(JSON.parse(line)); } catch { /* skip a damaged line */ }
    }
  }

  function apply(rec) {
    if (rec.unsub) {
      const s = byToken.get(rec.unsub);
      if (s) { byEmail.delete(s.email); byToken.delete(rec.unsub); }
      return;
    }
    const existing = byEmail.get(rec.email);
    if (existing) { if (rec.occasion) existing.occasions.add(rec.occasion); return; }
    const s = { email: rec.email, occasions: new Set(rec.occasion ? [rec.occasion] : []), t: rec.t, token: rec.token };
    byEmail.set(s.email, s);
    byToken.set(s.token, s);
  }

  async function write(rec) {
    apply(rec);
    if (!file) return;
    mkdirSync(path.dirname(file), { recursive: true });
    await appendFile(file, JSON.stringify(rec) + '\n');
  }

  return {
    async add(email, occasion = '', now = new Date()) {
      const e = email.trim().toLowerCase();
      const occ = /^[a-z]{2,20}$/.test(occasion) ? occasion : '';
      const existing = byEmail.get(e);
      if (existing && (!occ || existing.occasions.has(occ))) return { added: false };
      await write({ email: e, occasion: occ, t: now.toISOString(), token: existing?.token || randomBytes(16).toString('hex') });
      return { added: !existing };
    },
    async remove(token) {
      if (!/^[a-f0-9]{32}$/.test(token || '') || !byToken.has(token)) return false;
      await write({ unsub: token, t: new Date().toISOString() });
      return true;
    },
    count: () => byEmail.size,
    list: () => [...byEmail.values()].map((s) => ({ email: s.email, occasions: [...s.occasions], t: s.t, token: s.token })),
  };
}

export function toCsv(rows, siteUrl) {
  // Prefix values a spreadsheet would treat as a formula.
  const q = (v) => { let x = String(v); if (/^[=+\-@\t\r]/.test(x)) x = "'" + x; return `"${x.replace(/"/g, '""')}"`; };
  return ['email,occasions,signed_up,unsubscribe_link', ...rows.map((r) => [r.email, r.occasions.join(' '), r.t, `${siteUrl}/unsubscribe?t=${r.token}`].map(q).join(','))].join('\n') + '\n';
}
