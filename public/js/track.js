// Anonymous usage counts. No cookies, no IDs: each call just adds 1 to a daily total on our server.
// Skipped when the browser sends Do Not Track or Global Privacy Control.
const off = navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
let lastPage = '';

export function track(e, o = '') {
  if (off) return;
  const body = JSON.stringify({ e, o, p: location.pathname, r: e === 'page_view' ? document.referrer : '' });
  try {
    if (navigator.sendBeacon) navigator.sendBeacon('/api/event', new Blob([body], { type: 'application/json' }));
    else fetch('/api/event', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true });
  } catch { /* counting must never break the page */ }
}

/** Count a page view once per path (the app re-renders the same page when filters change). */
export function pageView() {
  if (location.pathname === lastPage) return;
  lastPage = location.pathname;
  track('page_view');
}

/** Elements with data-track="event" count a click. */
export function trackClicks(root = document) {
  root.addEventListener('click', (ev) => {
    const el = ev.target.closest?.('[data-track]');
    if (el) track(el.dataset.track, el.dataset.trackO || '');
  });
}
