# Putting Sorted. live

The site is a single Node.js app with no build step, so any host that runs `npm start` works. Railway is the quickest.

## Railway

1. railway.com → New project → Deploy from GitHub repo → pick `sorted`.
2. Railway detects Node and runs `npm start`. It sets `PORT` for you.
3. Variables tab: add everything you've filled in from `.env.example` (at least `SITE_URL` and `CONTACT_EMAIL`; `ANTHROPIC_API_KEY` to switch on photo reading).
4. Settings → Networking → Generate domain to test, then Custom domain for your real one.
5. Health check path: `/healthz`.
6. Daily feed refresh: add a second service from the same repo with start command `npm run feeds:sync` and a cron schedule such as `0 5 * * *`. Because Railway services don't share a disk, the simplest version is to run the sync in the web service at start-up instead: set the start command to `npm run feeds:sync && npm start` and redeploy daily. When the catalogue grows, move it to a database.

## Render (alternative)

New → Web Service → connect the repo. Build command: none (or `npm install`, which does nothing). Start command: `npm start`. Add the same environment variables. Add a Cron Job for `npm run feeds:sync`.

## Domain

- Buy the domain (check the name first: Companies House, the UK IPO trademark register, and the domain itself).
- Point it at the host using the DNS records the host shows you.
- Set `SITE_URL` to the final address (used in the sitemap).

## Before you share it

- [ ] Placeholders in `public/privacy.html` and `public/about.html` filled in
- [ ] `CONTACT_EMAIL` set to a real inbox on your domain
- [ ] Anthropic monthly spend limit set in the Anthropic console
- [ ] `npm test` passes
- [ ] `npm run partners:status` shows no ✗ for approved brands
- [ ] Clicked through one shop link per network and checked it lands on the right product
