# Connecting partners

How a brand goes from "on our list" to "earning us commission", and what to change in the code at each step.

## 1. Join the networks (once each)

You need a live site on your own domain first: networks review it before approving you (see DEPLOY.md).

| Network | Brands on our list | Join at | What to copy into `.env` |
|---|---|---|---|
| Awin | 54 | awin.com/gb/publishers (£5 deposit, refunded with first payout) | `AWIN_PUBLISHER_ID` (your publisher ID, top right of the dashboard) |
| Rakuten Advertising | 29 | rakutenadvertising.com | `RAKUTEN_SITE_ID` (your site ID, used in deep links) |
| Partnerize | 25 | usually by invite from a brand | nothing global: each brand gives its own camref |
| Impact | 7 | impact.com | nothing global: each brand has its own tracking link |
| Webgains | 6 | webgains.com | `WEBGAINS_CAMPAIGN_ID` |
| CJ | 4 | cj.com | `CJ_PUBLISHER_ID` (your PID) |
| Skimlinks (optional) | any | skimlinks.com | `SKIMLINKS_SITE_ID` – earns on links to brands you're not approved for yet; they keep a share |

When describing the site in applications, say: "Sorted. is a UK menswear outfit site. Users choose an occasion and we show complete outfits with links to buy each piece. Traffic is content and social, no paid search on brand terms, no voucher or cashback."

**Rakuten is moving brands to Impact in phases.** If a Rakuten brand tells you it has moved, set its network to Impact and use a tracking template (step 3). Old Rakuten links keep redirecting for at least a year.

## 2. Apply to each brand

Use the Brands tab in the launch hub to work through the list. In the code, update the brand in `data/brands.json` as things change:

```json
"affiliate": {
  "network": "Awin",
  "status": "applied",          // not-applied → applied → approved / declined, or "direct" for a direct deal
  "advertiserId": null,
  ...
}
```

## 3. When a brand approves you

Set `status` to `"approved"` and fill in the ID the network shows for that brand:

| Network | What goes in `advertiserId` | Where to find it |
|---|---|---|
| Awin | Advertiser ID (the number in the merchant profile URL, e.g. `ui.awin.com/merchant-profile/1402` → `1402`) | Advertiser directory |
| Rakuten | Advertiser MID | Advertiser's page in the Rakuten dashboard |
| CJ | Advertiser CID | Advertiser's page (used for reporting; links use your PID) |
| Partnerize | The brand's camref (e.g. `1011l3xYz`) | Campaign page → "Tracking link" |
| Webgains | Programme ID | Programme page |

For **Impact**, Tradedoubler, Adtraction, in-house programmes or anything unusual, copy one product link from the network's link builder and turn it into a template: replace the encoded shop address with `{url}` (and optionally your sub-ID with `{clickref}`), then put it in `trackingTemplate`. For example:

```json
"trackingTemplate": "https://brand.sjv.io/c/1234567/890123/45678?u={url}&subId1={clickref}"
```

Then run:

```bash
npm run partners:status
```

Every approved brand should show ✓. A ✗ means links for that brand are not being tracked yet.

**Before trusting a network's link format:** click one generated link from Sorted. (`/go/b/<brand-id>`) and compare it with the link the network's own link builder makes. They should point to the same tracking domain with your IDs in.

## 4. Product feeds

Approved brands give you product feeds. These replace the preview items with real products, prices and buy links.

**Awin:** Toolbox → Create-a-Feed → pick the approved brands, CSV format, include these columns:
`aw_product_id, product_name, merchant_id, merchant_name, aw_deep_link, deep_link, search_price, currency, aw_image_url, merchant_category, category_name, colour, in_stock, brand_name`.
Copy the download URL into `AWIN_FEED_URLS` (space-separated for several). It contains your API key, so it lives only in `.env` and your host's settings.

**Other networks:** copy `data/feeds.example.json` to `data/feeds.json`, add one entry per feed, and map its column names (check the header row of a downloaded file; the example's names are only a guide). Put each download URL in the env var the entry names.

Then:

```bash
npm run feeds:sync     # writes data/catalogue.json
npm start              # the site now uses real products
```

Run the sync daily so prices and stock stay current. On Railway, add a cron service with the command `npm run feeds:sync`. The feed's ready-made tracked link (`aw_deep_link` for Awin) is used as is.

## 5. Small brands with no programme

Agree a commission rate by email and track it one of three ways:

1. **Shopify Collabs**, if they're on Shopify: they invite you and Collabs gives you a tracked link. Put it in `trackingTemplate`.
2. **Tagged links**: send people with UTM tags (the default for any brand without an ID) and ask them to report sales from `utm_source=sorted`.
3. **A discount code** unique to Sorted., shown on the results page (needs a small code change: ask Claude Code).

Set `status` to `"direct"` and note the agreement in the launch hub.

## Checking it's working

- Click logs are written to `data/clicks.log` (one JSON line per click, with a random `ref` that is also sent to the network as your click reference, so network reports can be matched to clicks).
- On most hosts the disk is wiped on each deploy, so for real reporting move clicks to a database or analytics tool once you have traffic.
