// EZD-134: the names and numbers of the device caches, shared by the worker (sw-rules.mjs, copied into
// public/sw.js by build-sw.mjs), the page (warm-message.ts, clear-caches.ts) and the Defaults registry. Values
// only, so a page that imports one loads nothing else.

// Every cache this app makes starts with this; sign-out deletes them all (clear-caches.ts).
export const CACHE_PREFIX = 'ezdraft-';
// The app shell pages (Projects, Settings, terms).
export const SHELL_CACHE = 'ezdraft-shell';
// Built scripts, styles and fonts (hashed file names) and the app icons.
export const STATIC_CACHE = 'ezdraft-static';
// Project pages and, from EZD-1401, project data; trimmed to the device cache budget.
export const PROJECT_CACHE = 'ezdraft-projects';
// How many static files are kept (the oldest stored are dropped first).
export const STATIC_MAX_ENTRIES = 400;
// The page's message to the worker after a load.
export const WARM_MESSAGE = 'ezdraft-warm';
// Every answer names the server's app build (next.config.ts); a page copy from another build is fetched again.
export const BUILD_HEADER = 'x-ezdraft-app-build';
// Settings > Defaults device cache budget, in megabytes (assumption EZD-134 in vault/build/assumptions.md).
export const DEVICE_CACHE_BUDGET_KEY = 'device_cache_budget';
export const DEVICE_CACHE_BUDGET_DEFAULT_MB = 500;
export const DEVICE_CACHE_BUDGET_MIN_MB = 100;
export const DEVICE_CACHE_BUDGET_MAX_MB = 10000;
export const BYTES_PER_MB = 1048576;
