// Reads settings from environment variables (and a local .env file in development).
// Every setting is optional: the site runs without any of them, with the matching feature switched off.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envFile = path.join(ROOT, '.env');
if (existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(envFile); } catch { /* ignore a malformed .env; real env vars still apply */ }
}

const env = (name, fallback = '') => (process.env[name] ?? fallback).trim();

export const config = {
  port: Number(env('PORT', '3000')),
  siteUrl: env('SITE_URL', 'http://localhost:3000').replace(/\/$/, ''),
  siteName: env('SITE_NAME', 'Sorted.'),
  contactEmail: env('CONTACT_EMAIL', 'hello@example.com'),

  // Photo recognition (Claude). Without a key, the upload page asks people to pick type and colour themselves.
  anthropicApiKey: env('ANTHROPIC_API_KEY'),
  anthropicModel: env('ANTHROPIC_MODEL', 'claude-haiku-5-5'),

  // Affiliate network publisher IDs. Leave blank until you are approved.
  awinPublisherId: env('AWIN_PUBLISHER_ID'),
  awinFeedUrls: env('AWIN_FEED_URLS').split(/\s+/).filter(Boolean),
  rakutenSiteId: env('RAKUTEN_SITE_ID'),
  cjPublisherId: env('CJ_PUBLISHER_ID'),
  webgainsCampaignId: env('WEBGAINS_CAMPAIGN_ID'),
  skimlinksSiteId: env('SKIMLINKS_SITE_ID'),
  // Sovrn Commerce (formerly VigLink): the same idea as Skimlinks. If both are set, Skimlinks is used.
  sovrnKey: env('SOVRN_KEY'),

  // Who runs the site, shown on the privacy and about pages. A sole trader needs only a name;
  // add the company number and registered address once you form a company.
  operatorName: env('OPERATOR_NAME'),
  companyNumber: env('COMPANY_NUMBER'),
  operatorAddress: env('OPERATOR_ADDRESS'),

  // Ownership-check tags that networks ask you to add to your site's <head>, as name=content pairs
  // separated by | (e.g. "skimlinks-site-verification=abc123|google-site-verification=xyz").
  siteVerification: env('SITE_VERIFICATION'),

  // Where we keep click logs, usage counts and email sign-ups. On Railway, mount a volume and point DATA_DIR at it
  // (e.g. /data), otherwise these files are wiped on every deploy.
  dataDir: env('DATA_DIR', path.join(ROOT, 'data')),
  get clickLogFile() { return env('CLICK_LOG_FILE', path.join(this.dataDir, 'clicks.log')); },
  get statsFile() { return path.join(this.dataDir, 'stats.json'); },
  get subscribersFile() { return path.join(this.dataDir, 'subscribers.jsonl'); },

  // Password for /admin (usage counts and the sign-up list). Leave blank to switch /admin off.
  adminPassword: env('ADMIN_PASSWORD'),
  catalogueFile: env('CATALOGUE_FILE', path.join(ROOT, 'data', 'catalogue.json')),

  maxUploadBytes: 6 * 1024 * 1024,
};

export function publicConfig() {
  return {
    siteName: config.siteName,
    recognition: Boolean(config.anthropicApiKey),
    contactEmail: config.contactEmail,
  };
}
