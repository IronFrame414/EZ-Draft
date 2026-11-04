// Writes plan-r6-samples.md and plan-r6-counts.json from samples-b6.mjs (Q-0418 (a)). The `allow` items already in the
// worktree's stillAllowed and the known-limit items are left out. node gen-samples-md.mjs <worktree test file> <old hook>
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const [testFile, oldHook] = process.argv.slice(2);
const here = (f) => new URL(`./${f}`, import.meta.url);
const src = fs.readFileSync(here('samples-b6.mjs'), 'utf8');
const grab = (name, text) => {
  const i = text.indexOf(`const ${name} = [`);
  return eval(text.slice(i + `const ${name} = `.length, text.indexOf('\n];', i) + 2));
};
const tests = fs.readFileSync(testFile, 'utf8');
const have = new Set([...grab('stillAllowed', tests), ...grab('builtPaths', tests)]);
const deny = grab('deny', src).filter((c) => !have.has(c));
const cut = src.indexOf('// known limit');
const allow = grab('allow', src.slice(0, cut) + '\n];').filter((c) => !have.has(c));
const denied = (c) => spawnSync('node', [oldHook], { input: JSON.stringify({ tool_input: { command: c } }), encoding: 'utf8' }).stdout.includes('"deny"');
const js = (c) => `\`${JSON.stringify(c).slice(1, -1).replace(/\\"/g, '"').replace(/`/g, '\\`')}\``;
const greenDeny = deny.flatMap((c, i) => (denied(c) ? [26 + i] : []));
const redAllow = allow.flatMap((c, i) => (denied(c) ? [26 + i] : []));
const builtPaths = 25 + deny.length;
const stillAllowed = 25 + allow.length;
const md = `**Samples B6** (Re-run 6; Q-0418 (a)); each item is the JavaScript string literal written as shown (\`\\n\` a newline, \`\\\\\` one backslash). Appended to \`builtPaths\` in order (items 26-${builtPaths}): ${deny.map(js).join(', ')}. Appended to \`stillAllowed\` in order (items 26-${stillAllowed}): ${allow.map(js).join(', ')}. On \`7424332b\`: \`builtPaths\` items ${greenDeny.join(', ')} are already denied, the other ${deny.length - greenDeny.length} new items are red; \`stillAllowed\` items ${redAllow.join(', ')} are red (finding 4).`;
fs.writeFileSync(here('plan-r6-samples.md'), `${md}\n`);
fs.writeFileSync(here('plan-r6-counts.json'), JSON.stringify({ builtPaths, stillAllowed }));
console.log(`builtPaths ${builtPaths}, stillAllowed ${stillAllowed}, md ${md.length} chars`);
