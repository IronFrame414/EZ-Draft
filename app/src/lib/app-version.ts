// EZD-299a Build step 4 (vault/plans/EZD-299a.md Decided D-Build; Q-0626): the app build number a save names,
// and the server's check of it. Browser and server: `next.config.ts` inlines EZD_APP_BUILD into both bundles at
// build time; Vitest leaves it unset (0). EZD-134 reuses this module.

// The header every save carries with the build number it came from.
export const APP_BUILD_HEADER = 'x-ezdraft-app-build';

const BUILD_PATTERN = /^[1-9][0-9]{0,14}$/;
const HEADER_PATTERN = /^[0-9]{1,15}$/;

// EZD_APP_BUILD read per call: a match of BUILD_PATTERN is that number, anything else 0.
export function appBuild(): number {
  const value = process.env.EZD_APP_BUILD;
  return value !== undefined && BUILD_PATTERN.test(value) ? Number(value) : 0;
}

// True when the header is missing, not a number, or lower than the current build. A higher one is accepted
// (a server rolled back to an older build).
export function isOlderBuild(header: string | null, current: number): boolean {
  if (header === null || !HEADER_PATTERN.test(header)) return true;
  return Number(header) < current;
}
