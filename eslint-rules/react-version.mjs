// EZD-186 (vault/plans/EZD-186.md; Q-0324): the React version the root ESLint config gives app/** files.
// eslint-config-next sets settings.react.version to 'detect', which resolves react from the linted file's
// folder or the cwd; react is an app dependency only, so a root lint warns and assumes 999.999.999.
// This reads the one exact version app/package.json pins and returns it, so the warning never fires.
import { readFileSync } from 'node:fs';
import path from 'node:path';

// One exact version with an optional prerelease suffix (plan D3; check C1 "one exact version").
const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/**
 * Returns the exact react version from <appDir>/package.json dependencies.react.
 * Throws when it is missing or not one exact version (plan D4); never falls back to 'detect'.
 * @param {string} appDir absolute path of the app folder
 * @returns {string}
 */
export function pinnedReactVersion(appDir) {
  const pkg = JSON.parse(readFileSync(path.join(appDir, 'package.json'), 'utf8'));
  const version = pkg?.dependencies?.react;
  if (typeof version !== 'string' || !EXACT_VERSION.test(version)) {
    throw new Error(
      'react_version_not_pinned: app/package.json dependencies.react must be one exact version',
    );
  }
  return version;
}
