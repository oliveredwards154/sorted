# Sorted.

Menswear, decided. Pick the occasion (pub, wedding, interview, date, office, weekend), play three rounds of "this or that", and get one merged style with pieces to buy from UK shops at three price levels. Or upload a photo of something you own and find similar pieces.

The site earns affiliate commission when people buy through its shop links.

## Run it

You need [Node.js](https://nodejs.org) 22 or newer. There are no packages to install.

```bash
cp .env.example .env     # optional: fill in keys as you get them
npm start                # http://localhost:3000
npm run dev              # same, restarts when you change a file
npm test                 # runs the test suite
```

It works with no settings at all: you get the full flow with a preview catalogue of example items. Each feature switches on when its setting is present (see `.env.example`).

## What's where

| Path | What it is |
|---|---|
| `server.js` | The web server: pages, API, shop redirects, image proxy |
| `public/` | The front end (HTML, CSS, plain JavaScript modules) and static pages (privacy, cookies, about, affiliate disclosure) |
| `public/js/app.js` | The single-page app: occasions, rounds, your style, upload, results, shops, wardrobe |
| `public/js/style.js` | Rounds and the merged-style logic (pure functions, tested) |
| `src/affiliate.js` | Builds tracked links for Awin, Rakuten, CJ, Partnerize, Webgains, Skimlinks |
| `src/catalogue.js` | Loads products and ranks them for a search |
| `src/feeds/` | Reads product feeds from the networks into one catalogue |
| `src/recognise.js` | Photo recognition with Claude |
| `data/occasions.json` | The six occasions and their looks |
| `data/brands.json` | 154 UK brands with affiliate network and approval status |
| `scripts/` | Feed sync, partner status report, link checker |
| `docs/` | Setup, partners and deployment guides |

## Going live

1. [docs/DEPLOY.md](docs/DEPLOY.md) – put it on a domain (Railway or Render).
2. [docs/PARTNERS.md](docs/PARTNERS.md) – join the networks, record approvals, connect product feeds.
3. Fill in the placeholders in `public/privacy.html` and `public/about.html` (company name, number, address, contact email).

Useful commands once partners are connected:

```bash
npm run partners:status   # which networks and brands are set up, and whether links are tracked
npm run feeds:sync        # download product feeds into data/catalogue.json (run daily)
npm run links:check       # check every shop website and application link still works
```

## Photos

The outfit and product photos are free-licence placeholders from Pexels (see `public/images/CREDITS.md`). Live product images come from partner feeds.
