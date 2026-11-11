// Turns a shop's product URL into a tracked affiliate link, based on which network the brand uses.
//
// A brand only earns us commission once (a) we have joined its network and set our publisher ID
// in the environment, and (b) the brand has approved us, which we record in data/brands.json by
// setting affiliate.status to "approved" and filling in affiliate.advertiserId.
// Until then we send people straight to the shop with UTM tags, so nothing breaks.
//
// The link formats below are the standard deep-link formats each network documents. Check them
// against the link your network dashboard generates for one product before going live; if a brand
// gives you its own format, put it in affiliate.trackingTemplate with {url} where the encoded
// destination goes, and it wins over everything here.

const enc = encodeURIComponent;

export function withUtm(rawUrl, { source = 'sorted', medium = 'affiliate', campaign = 'outfit' } = {}) {
  try {
    const u = new URL(rawUrl);
    if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', source);
    if (!u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', medium);
    if (!u.searchParams.has('utm_campaign')) u.searchParams.set('utm_campaign', campaign);
    return u.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * @param {string} destination  the shop's own product (or category) URL
 * @param {object} brand        an entry from data/brands.json
 * @param {object} ids          publisher IDs from config
 * @param {string} [clickRef]   our own reference for the click, so network reports can be matched to our logs
 * @returns {{ url: string, tracked: boolean, network: string }}
 */
export function buildAffiliateLink(destination, brand, ids, clickRef = '') {
  const a = (brand && brand.affiliate) || {};
  const network = a.network || 'None found';
  const direct = { url: withUtm(destination), tracked: false, network };
  if (!destination || !/^https?:\/\//i.test(destination)) return { ...direct, url: destination || '' };

  if (a.trackingTemplate && a.status === 'approved') {
    return { url: a.trackingTemplate.replaceAll('{url}', enc(destination)).replaceAll('{clickref}', enc(clickRef)), tracked: true, network };
  }

  const approved = a.status === 'approved' && a.advertiserId;
  if (approved) {
    const mid = enc(String(a.advertiserId));
    switch (network) {
      case 'Awin':
        if (ids.awinPublisherId)
          return { url: `https://www.awin1.com/cread.php?awinmid=${mid}&awinaffid=${enc(ids.awinPublisherId)}&clickref=${enc(clickRef)}&ued=${enc(destination)}`, tracked: true, network };
        break;
      case 'Rakuten':
        if (ids.rakutenSiteId)
          return { url: `https://click.linksynergy.com/deeplink?id=${enc(ids.rakutenSiteId)}&mid=${mid}&u1=${enc(clickRef)}&murl=${enc(destination)}`, tracked: true, network };
        break;
      case 'CJ':
        if (ids.cjPublisherId)
          return { url: `https://www.anrdoezrs.net/links/${enc(ids.cjPublisherId)}/type/dlg/sid/${enc(clickRef)}/${destination}`, tracked: true, network };
        break;
      case 'Partnerize':
        // advertiserId holds the "camref" Partnerize gives you per brand.
        return { url: `https://prf.hn/click/camref:${enc(String(a.advertiserId))}/pubref:${enc(clickRef)}/destination:${enc(destination)}`, tracked: true, network };
      case 'Webgains':
        if (ids.webgainsCampaignId)
          return { url: `https://track.webgains.com/click.html?wgcampaignid=${enc(ids.webgainsCampaignId)}&wgprogramid=${mid}&clickref=${enc(clickRef)}&wgtarget=${enc(destination)}`, tracked: true, network };
        break;
      default:
        break; // Impact, Tradedoubler, Adtraction and in-house programmes need a per-brand trackingTemplate.
    }
  }

  // Not approved yet: optionally let Skimlinks monetise the click for us while we wait.
  if (ids.skimlinksSiteId) {
    return { url: `https://go.skimresources.com/?id=${enc(ids.skimlinksSiteId)}&xs=1&xcust=${enc(clickRef)}&url=${enc(destination)}`, tracked: true, network: 'Skimlinks' };
  }
  return direct;
}
