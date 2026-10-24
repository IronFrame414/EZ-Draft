// EZD-025 Step 6 (vault/plans/EZD-025.md): reads Josh's restore file (outside the repo). Values go only to the
// run, never into process.env.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/** `Record<string, string>` parsed with `util.parseEnv`. */
export function loadEnvFile(absPath) {
  return { ...parseEnv(readFileSync(absPath, 'utf8')) };
}
