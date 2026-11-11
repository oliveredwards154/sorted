# Sorted. – notes for Claude Code

UK menswear site that picks outfits by occasion and earns affiliate commission on shop clicks. Two founders, early stage: keep things simple and readable.

## Stack and rules
- Plain Node.js 22+ with **no npm dependencies**. Server is `server.js` using `node:http`; front end is plain ES modules in `public/js/`. Don't add a framework or packages without asking; if one is truly needed, explain why first.
- Tests use the built-in runner: `npm test` (files in `test/*.test.js`). Add or update tests with every logic change. Run them before saying something works.
- Run locally with `npm run dev` (port 3000). Settings come from `.env` (see `.env.example`); never commit `.env` or put keys in code.
- British English in all user-facing copy. Copy is plain and direct; prices in £.

## How it fits together
- Occasions and looks: `data/occasions.json` (6 occasions × 6 looks; rounds show looks 0-1, 2-3, 4-5). Merge logic in `public/js/style.js`.
- Products: `src/catalogue.js` loads `data/catalogue.json` (built by `npm run feeds:sync` from partner feeds) or falls back to the preview set in `data/sample-products.json`. Preview items have no brand or price and must stay labelled "Example".
- Brands and affiliate status: `data/brands.json`. A brand earns commission only when `affiliate.status` is `"approved"` and `affiliate.advertiserId` (or `trackingTemplate`) is set, plus the network's publisher ID in env. `npm run partners:status` reports gaps.
- Every outbound shop link goes through `/go/p/:productId` or `/go/b/:brandId` so it can be tracked and logged. Never link straight to a shop from the front end. Mark shop links `rel="sponsored noopener"`.
- Photo recognition: `POST /api/recognise` calls the Anthropic Messages API with fetch (`src/recognise.js`). Photos are not stored. Rate-limited per IP.
- `/img?u=` proxies catalogue images only (so the browser can fingerprint them for visual matching). Don't turn it into an open proxy.

## Things to be careful with
- `brands.json` notes are internal research; the public site shows a generated description instead (`publicBrand` in server.js). Don't expose `affiliate` fields publicly.
- Affiliate link formats in `src/affiliate.js` are the standard documented ones; check against a link generated in each network's dashboard before going live.
- Legal pages (`public/privacy.html`, `cookies.html`, `affiliate-disclosure.html`) have placeholders in [BRACKETS] to fill before launch. If analytics or other cookies are added, update cookies.html and add consent.
