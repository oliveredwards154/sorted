// Small helpers shared by every HTML page we serve: the site-verification tags networks ask for,
// and the operator details on the legal pages (filled from settings, so no code change is needed).
import { config } from './config.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** "a=1|b=2" → <meta name="a" content="1"><meta name="b" content="2"> (names limited to safe characters). */
export function verificationMeta(value = config.siteVerification) {
  return String(value || '').split('|').map((pair) => {
    const i = pair.indexOf('=');
    if (i < 1) return '';
    const name = pair.slice(0, i).trim(), content = pair.slice(i + 1).trim();
    return /^[a-z0-9:_.-]{1,60}$/i.test(name) && content ? `<meta name="${esc(name)}" content="${esc(content)}">` : '';
  }).filter(Boolean).join('\n');
}

/** Who runs the site, for the privacy page. */
export function operatorLine(c = config) {
  if (!c.operatorName) return '[OPERATOR NAME]';
  let s = esc(c.operatorName);
  if (c.companyNumber) s += `, registered in England and Wales (company number ${esc(c.companyNumber)})`;
  if (c.operatorAddress) s += `, ${esc(c.operatorAddress)}`;
  return s;
}

export function contactLink(c = config) {
  const e = c.contactEmail && !/example\.com$/i.test(c.contactEmail) ? c.contactEmail : '';
  return e ? `<a href="mailto:${esc(e)}">${esc(e)}</a>` : '[CONTACT EMAIL]';
}

/** Fill placeholders and add verification tags to a static HTML page. */
export function finishPage(htmlText, c = config) {
  const meta = verificationMeta(c.siteVerification);
  return htmlText
    .replaceAll('{{operator}}', operatorLine(c))
    .replaceAll('{{contact}}', contactLink(c))
    .replace('</head>', meta ? `${meta}\n</head>` : '</head>');
}
