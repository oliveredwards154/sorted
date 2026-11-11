// Sends the email sign-up form without leaving the page. Without JavaScript the form still posts normally.
export function enhanceSignup(root = document) {
  root.querySelectorAll('form[data-signup]').forEach((form) => {
    if (form.dataset.ready) return;
    form.dataset.ready = '1';
    const msg = form.parentElement.querySelector('.signup-msg');
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = form.querySelector('button');
      btn.disabled = true;
      try {
        const r = await fetch(form.action, { method: 'POST', body: new URLSearchParams(new FormData(form)), headers: { accept: 'application/json' } });
        const out = await r.json();
        if (msg) msg.textContent = out.message;
        if (out.ok) form.reset();
      } catch {
        if (msg) msg.textContent = 'Couldn’t sign you up just now. Try again in a moment.';
      } finally { btn.disabled = false; }
    });
  });
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Same markup as the server-rendered form in src/pages.js. */
export function signupHtml(occId = '', lower = '') {
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
