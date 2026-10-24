#!/usr/bin/env node
// Cost by agent (optimize plan C2, vault/cost/optimize-plan-2026-10-20.md).
// Reads vault/cost/log.jsonl, then for each row the session transcript
// ~/.claude/projects/<project>/<session_id>.jsonl and its subagents/agent-*.jsonl (role from the matching .meta.json
// agentType; the main transcript is "orchestrator"). Sums message.usage once per message.id per file (the transcript
// repeats a message once per content block; the last copy carries the final output_tokens), prices it by the model
// that served each message and by token type, and prints markdown tables.
//
// Usage: node vault/tools/usage-by-agent.mjs [--since ISO] [--until ISO] [--rev HASH] [--out FILE]
//                                            [--log FILE] [--projects DIR] [--title TEXT]
// --since is inclusive, --until exclusive. --rev keeps only rows whose process_rev starts with HASH; rows without
// process_rev are skipped when --rev is given.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Dollars per million tokens. Source: the claude-api skill bundled with Claude Code 2.1.299 (pricing cached 2026-10-06):
// - shared/model-migration.md "Migrating to Claude Opus 5.5": $4 / $20, 5-minute cache writes $5, 1-hour $8, reads $0.20.
// - shared/model-migration.md "Migrating to Claude Sonnet 5.5": $2 / $10, 5-minute writes $2.50, 1-hour $4, reads $0.20.
// - shared/model-migration.md "Migrating to Claude Fable 5.1": $10 / $50, 5-minute writes $12.50, 1-hour $20, reads $0.25.
// - shared/model-migration.md "Migrating to Claude Haiku 5.5": $0.10 / $0.50 when the prompt is 100K tokens or fewer,
//   $0.50 / $2.50 when longer; cache reads 0.1x input, 5-minute writes 1.25x, 1-hour writes 2x (the same multipliers
//   as shared/prompt-caching.md "Economics").
// Every message in the 2026-10-19 runs was standard speed, standard tier, global inference geo, with no server-tool
// use and no fallback credit. Anything else has no rate here and stops the script (no guessed rates).
export const PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, write5m: 5, write1h: 8, read: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, write5m: 2.5, write1h: 4, read: 0.2 },
  'claude-fable-5-1': { input: 10, output: 50, write5m: 12.5, write1h: 20, read: 0.25 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, write5m: 0.125, write1h: 0.2, read: 0.01 },
};
const HAIKU_LONG = { input: 0.5, output: 2.5, write5m: 0.625, write1h: 1, read: 0.05 };
const HAIKU_LONG_PROMPT = 100_000;

// Weights of the earlier token-weighted count (vault/cost/efficiency-plan-2026-10-20.md line 3), for the sanity check.
const TOKEN_WEIGHTS = { input: 1, write5m: 1.25, write1h: 2, read: 0.1, output: 5 };

export class MissingRateError extends Error {}

// Splits one usage object into the five priced token types.
export function tokenTypes(u) {
  const write = u.cache_creation_input_tokens || 0;
  const write1h = Math.min(write, u.cache_creation?.ephemeral_1h_input_tokens || 0);
  return {
    input: u.input_tokens || 0,
    write5m: write - write1h,
    write1h,
    read: u.cache_read_input_tokens || 0,
    output: u.output_tokens || 0,
  };
}

export function priceUsage(model, u) {
  const where = `model ${model}`;
  if (u.speed && u.speed !== 'standard') throw new MissingRateError(`no rate for speed "${u.speed}" (${where})`);
  if (u.service_tier && u.service_tier !== 'standard') throw new MissingRateError(`no rate for service tier "${u.service_tier}" (${where})`);
  if (u.inference_geo && u.inference_geo !== 'global') throw new MissingRateError(`no rate for inference geo "${u.inference_geo}" (${where})`);
  const st = u.server_tool_use || {};
  for (const k of ['web_search_requests', 'web_fetch_requests']) {
    if (st[k]) throw new MissingRateError(`no rate for server tool ${k} (${where})`);
  }
  if (u.fallback_credit) throw new MissingRateError(`no rule for fallback_credit (${where})`);
  let rate = PRICES[model];
  if (!rate) throw new MissingRateError(`no rate for model "${model}"`);
  const t = tokenTypes(u);
  if (model === 'claude-haiku-5-5' && t.input + t.write5m + t.write1h + t.read > HAIKU_LONG_PROMPT) rate = HAIKU_LONG;
  let usd = 0;
  for (const k of Object.keys(t)) usd += (t[k] * rate[k]) / 1e6;
  return { usd, tokens: t };
}

function readJsonl(file) {
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // a partly written last line: skip it
    }
  }
  return out;
}

const PLAN_READ = /(^|\/)vault\/plans\/[^/\s]+\.md$/;
const PLAN_BASH = /vault\/plans\/[^\s'"|;&>]*\.md/;

function resultChars(content) {
  if (typeof content === 'string') return content.length;
  if (Array.isArray(content)) return content.reduce((n, c) => n + (typeof c?.text === 'string' ? c.text.length : 0), 0);
  return 0;
}

// One transcript file: its messages (one per message.id) and the characters of vault/plans/*.md returned to Read or
// Bash tool results.
export function readTranscript(file) {
  const byId = new Map();
  const planTools = new Set();
  let planChars = 0;
  let planReads = 0;
  let advisorCalls = 0; // process v2.4: advisor tool uses in this transcript
  const dispatches = []; // process v2.4: Agent dispatches with the model and effort passed on them
  for (const j of readJsonl(file)) {
    const content = j.message?.content;
    if (j.type === 'assistant') {
      const m = j.message;
      if (m?.id && m.usage && m.model !== '<synthetic>') byId.set(m.id, { model: m.model, usage: m.usage });
      if (Array.isArray(content)) {
        for (const c of content) {
          if ((c?.type === 'tool_use' || c?.type === 'server_tool_use') && /advisor/i.test(c.name || '')) advisorCalls += 1;
          if (c?.type !== 'tool_use') continue;
          if (c.name === 'Agent' || c.name === 'Task') dispatches.push({ agent: c.input?.subagent_type || '?', model: c.input?.model || 'default', effort: c.input?.effort || 'default' });
          if (c.name === 'Read' && PLAN_READ.test(c.input?.file_path || '')) planTools.add(c.id);
          if (c.name === 'Bash' && PLAN_BASH.test(c.input?.command || '')) planTools.add(c.id);
        }
      }
    } else if (j.type === 'user' && Array.isArray(content)) {
      for (const c of content) {
        if (c?.type === 'tool_result' && planTools.has(c.tool_use_id)) {
          planChars += resultChars(c.content);
          planReads += 1;
          planTools.delete(c.tool_use_id);
        }
      }
    }
  }
  return { messages: [...byId.values()], planChars, planReads, advisorCalls, dispatches };
}

// All transcripts of one launcher run, or null when the main transcript is missing.
export function sessionFiles(projectsDir, sessionId) {
  const main = path.join(projectsDir, `${sessionId}.jsonl`);
  if (!fs.existsSync(main)) return null;
  const files = [{ file: main, role: 'orchestrator' }];
  const dir = path.join(projectsDir, sessionId, 'subagents');
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir).sort()) {
      if (!/^agent-.*\.jsonl$/.test(name)) continue;
      const metaFile = path.join(dir, name.replace(/\.jsonl$/, '.meta.json'));
      let role = 'unknown';
      if (fs.existsSync(metaFile)) role = JSON.parse(fs.readFileSync(metaFile, 'utf8')).agentType || 'unknown';
      files.push({ file: path.join(dir, name), role });
    }
  }
  return files;
}

export function loadRows(logFile, { since, until, rev } = {}) {
  return readJsonl(logFile).filter((r) => {
    if (!r.session_id) return false;
    if (since && !(r.ts >= since)) return false;
    if (until && !(r.ts < until)) return false;
    if (rev && !(r.process_rev && String(r.process_rev).startsWith(rev))) return false;
    return true;
  });
}

const zeroTokens = () => ({ input: 0, write5m: 0, write1h: 0, read: 0, output: 0 });
function add(map, key, init) {
  if (!map.has(key)) map.set(key, init());
  return map.get(key);
}

// Totals for a set of log rows. Throws MissingRateError when a message has no rate.
export function analyze(rows, projectsDir) {
  const cells = new Map(); // unit|role|model
  const tickets = new Map();
  const plan = new Map(); // unit|role
  const advisor = new Map(); // role -> advisor calls (v2.4)
  const missing = [];
  let estUsd = 0;
  for (const r of rows) {
    estUsd += r.est_usd || 0;
    const ticket = r.ticket ?? '';
    const tk = add(tickets, ticket, () => ({ ticket, usd: 0, byUnit: {}, runs: 0, tokens: 0, advisor: 0, dispatches: [] }));
    tk.runs += 1;
    const files = sessionFiles(projectsDir, r.session_id);
    if (!files) {
      missing.push(r.session_id);
      continue;
    }
    for (const { file, role } of files) {
      const t = readTranscript(file);
      const p = add(plan, `${r.unit}|${role}`, () => ({ unit: r.unit, role, chars: 0, reads: 0 }));
      p.chars += t.planChars;
      p.reads += t.planReads;
      tk.advisor += t.advisorCalls;
      tk.dispatches.push(...t.dispatches);
      const adv = add(advisor, role, () => ({ role, calls: 0 }));
      adv.calls += t.advisorCalls;
      for (const m of t.messages) {
        const { usd, tokens } = priceUsage(m.model, m.usage);
        const c = add(cells, `${r.unit}|${role}|${m.model}`, () => ({ unit: r.unit, role, model: m.model, usd: 0, messages: 0, tokens: zeroTokens() }));
        c.usd += usd;
        c.messages += 1;
        for (const k of Object.keys(tokens)) c.tokens[k] += tokens[k];
        tk.usd += usd;
        tk.byUnit[r.unit] = (tk.byUnit[r.unit] || 0) + usd;
        tk.tokens += Object.values(tokens).reduce((n, v) => n + v, 0);
      }
    }
  }
  return { cells: [...cells.values()], tickets: [...tickets.values()], plan: [...plan.values()], advisor: [...advisor.values()], missing, estUsd, rows: rows.length };
}

const weighted = (t) => Object.keys(TOKEN_WEIGHTS).reduce((n, k) => n + t[k] * TOKEN_WEIGHTS[k], 0);
const usd = (n) => `$${n.toFixed(2)}`;
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '-');
const mtok = (n) => (n / 1e6).toFixed(2);

// Groups of the earlier token-weighted count (efficiency-plan-2026-10-20.md section 2): plan and questions units
// whole, build units by role.
export function shareGroup(unit, role) {
  if (unit === 'build') return `build ${role}`;
  return `${unit} (whole unit)`;
}

export function render(a, { title = 'Cost by agent', scope = '' } = {}) {
  const total = a.cells.reduce((n, c) => n + c.usd, 0);
  const totalW = a.cells.reduce((n, c) => n + weighted(c.tokens), 0);
  const L = [];
  L.push(`# ${title}`, '');
  if (scope) L.push(scope, '');
  L.push('Generated by `node vault/tools/usage-by-agent.mjs`. Prices are list API rates from the claude-api skill (sources in the script header). The runs were on the Max plan, so this is the API-equivalent value, not a bill.', '');
  L.push(`Log rows: ${a.rows}. Missing transcripts: ${a.missing.length}${a.missing.length ? ` (${a.missing.join(', ')})` : ''}.`);
  L.push(`Total: **${usd(total)}** (launcher estimate \`est_usd\` for the same rows: ${usd(a.estUsd)}).`, '');

  L.push('## $ by unit kind, role and model', '');
  L.push('Token columns are millions of tokens.', '');
  L.push('| Unit | Role | Model | Messages | Input | Write 5m | Write 1h | Read | Output | $ | Share |', '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const c of [...a.cells].sort((x, y) => y.usd - x.usd)) {
    const t = c.tokens;
    L.push(`| ${c.unit} | ${c.role} | ${c.model} | ${c.messages} | ${mtok(t.input)} | ${mtok(t.write5m)} | ${mtok(t.write1h)} | ${mtok(t.read)} | ${mtok(t.output)} | ${usd(c.usd)} | ${pct(c.usd, total)} |`);
  }
  L.push('');

  L.push('## Share by group ($ and token-weighted)', '');
  L.push("Token-weighted uses the earlier count's weights (fresh input 1, cache write 1.25 / 2, cache read 0.1, output 5; every model alike), for comparison with `vault/cost/efficiency-plan-2026-10-20.md` section 2.", '');
  L.push('| Group | $ | $ share | Token-weighted share |', '|---|---:|---:|---:|');
  const groups = new Map();
  for (const c of a.cells) {
    const g = add(groups, shareGroup(c.unit, c.role), () => ({ usd: 0, w: 0 }));
    g.usd += c.usd;
    g.w += weighted(c.tokens);
  }
  for (const [name, g] of [...groups].sort((x, y) => y[1].usd - x[1].usd)) L.push(`| ${name} | ${usd(g.usd)} | ${pct(g.usd, total)} | ${pct(g.w, totalW)} |`);
  L.push('');

  L.push('## $ by model', '');
  L.push('| Model | $ | Share |', '|---|---:|---:|');
  const models = new Map();
  for (const c of a.cells) models.set(c.model, (models.get(c.model) || 0) + c.usd);
  for (const [m, v] of [...models].sort((x, y) => y[1] - x[1])) L.push(`| ${m} | ${usd(v)} | ${pct(v, total)} |`);
  L.push('');

  const units = [...new Set(a.cells.map((c) => c.unit))].sort();
  L.push('## $ per ticket', '');
  L.push('Ticket as the log row names it (a questions unit names its phase).', '');
  L.push(`| Ticket | Runs | ${units.join(' | ')} | Total |`, `|---|---:|${units.map(() => '---:|').join('')}---:|`);
  for (const t of [...a.tickets].sort((x, y) => y.usd - x.usd)) {
    L.push(`| ${t.ticket} | ${t.runs} | ${units.map((u) => (t.byUnit[u] ? usd(t.byUnit[u]) : '-')).join(' | ')} | ${usd(t.usd)} |`);
  }
  L.push('');

  L.push('## Tokens, advisor calls and dispatches per ticket (process v2.4)', '');
  L.push('Tokens are all token types summed, in millions. Advisor calls are advisor tool uses in the run transcripts. Dispatches list each Agent call as agent model/effort ("default" when the dispatch passed none).', '');
  L.push('| Ticket | Tokens (M) | Advisor calls | Dispatches |', '|---|---:|---:|---|');
  for (const t of [...a.tickets].sort((x, y) => y.usd - x.usd)) {
    const d = t.dispatches.map((x) => `${x.agent} ${x.model.replace(/^claude-/, '')}/${x.effort}`).join('; ') || '-';
    L.push(`| ${t.ticket} | ${mtok(t.tokens)} | ${t.advisor} | ${d} |`);
  }
  L.push('');
  L.push('Advisor calls by role: ' + ((a.advisor || []).filter((x) => x.calls).map((x) => `${x.role} ${x.calls}`).join(', ') || 'none') + '.', '');

  L.push('## Plan characters read per role', '');
  L.push('Characters of `vault/plans/*.md` returned to Read or Bash tool results (a Bash result counts whole when its command names a plan file).', '');
  L.push('| Unit | Role | Reads | Characters |', '|---|---|---:|---:|');
  for (const p of [...a.plan].filter((x) => x.reads).sort((x, y) => y.chars - x.chars)) L.push(`| ${p.unit} | ${p.role} | ${p.reads} | ${p.chars.toLocaleString('en-US')} |`);
  const reads = a.plan.reduce((n, p) => n + p.reads, 0);
  const chars = a.plan.reduce((n, p) => n + p.chars, 0);
  L.push(`| all | all | ${reads} | ${chars.toLocaleString('en-US')} |`, '');
  return L.join('\n');
}

export function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) throw new Error(`unexpected argument ${k}`);
    const v = argv[++i];
    if (v === undefined) throw new Error(`${k} needs a value`);
    o[k.slice(2)] = v;
  }
  return o;
}

// Claude Code's project folder name: the main checkout's path with every non-alphanumeric character as "-". Launcher
// runs start in the main checkout, so a worktree maps back to it.
export function projectsDirFor(repo) {
  const main = repo.replace(/\/\.claude\/worktrees\/[^/]+\/?$/, '');
  return path.join(os.homedir(), '.claude/projects', main.replace(/[^A-Za-z0-9]/g, '-'));
}

function main() {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const o = parseArgs(process.argv.slice(2));
  const rows = loadRows(o.log || path.join(repo, 'vault/cost/log.jsonl'), o);
  const scope = [o.since && `since ${o.since}`, o.until && `until ${o.until}`, o.rev && `process_rev ${o.rev}`].filter(Boolean).join(', ');
  let a;
  try {
    a = analyze(rows, o.projects || projectsDirFor(repo));
  } catch (e) {
    if (e instanceof MissingRateError) {
      console.error(`usage-by-agent: stopped: ${e.message}. Add the rate from the claude-api skill's pricing reference; never guess one.`);
      process.exit(2);
    }
    throw e;
  }
  const md = render(a, { title: o.title, scope: scope ? `Log rows ${scope}.` : '' });
  if (o.out) fs.writeFileSync(o.out, md + '\n');
  else process.stdout.write(md + '\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
