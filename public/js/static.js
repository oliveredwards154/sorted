// For the plain pages (guides, about, privacy and so on).
import { pageView, trackClicks } from './track.js';
import { enhanceSignup } from './signup.js';
pageView();
trackClicks();
enhanceSignup();
