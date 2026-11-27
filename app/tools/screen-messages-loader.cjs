// EZD-1995 (AC-EZD-1995-1; Q-0814): the app build's loader for app/src/lib/messages/screens/<screen>.messages.ts.
// It replaces the file with the screen's own messages, written out, so the browser file holds that slice only and
// never the whole catalog. It reads the catalog (server/messages/catalogs/en.ts) and the screen's key prefixes
// (server/messages/screen-prefixes.ts) from source; both files hold data only. A dev message is never included.
// Registered in app/next.config.ts (turbopack.rules). screen-messages.test.ts checks it against screenSlice().
// A bundler loader is a CommonJS module, so it loads its parts with require().
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const MESSAGES = path.resolve(__dirname, '..', 'src', 'server', 'messages');
const CATALOG = path.join(MESSAGES, 'catalogs', 'en.ts');
const PREFIXES = path.join(MESSAGES, 'screen-prefixes.ts');

/** The exports of a TypeScript file that holds data only (type imports are erased). */
function dataOf(file) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', js)(exports, (name) => {
    throw new Error(`${path.basename(file)} must hold data only, but it imports ${name}`);
  });
  return exports;
}

/** The screen's messages: every English message, outside dev, under one of the screen's prefixes. */
function sliceFor(screen) {
  const prefixes = dataOf(PREFIXES).SCREEN_MESSAGES[screen];
  if (!Array.isArray(prefixes)) throw new Error(`no SCREEN_MESSAGES entry "${screen}" in screen-prefixes.ts`);
  const en = dataOf(CATALOG).en;
  const out = {};
  for (const key of Object.keys(en)) {
    if (!key.startsWith('dev.') && prefixes.some((p) => key.startsWith(p))) out[key] = en[key];
  }
  return out;
}

module.exports = function screenMessagesLoader() {
  const name = /([^/\\]+)\.messages\.ts$/.exec(this.resourcePath);
  if (!name) throw new Error(`${this.resourcePath} is not a <screen>.messages.ts file`);
  if (typeof this.addDependency === 'function') {
    this.addDependency(CATALOG);
    this.addDependency(PREFIXES);
  }
  return `export default ${JSON.stringify(sliceFor(name[1]))};\n`;
};
module.exports.sliceFor = sliceFor;
