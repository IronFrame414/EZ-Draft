// EZD-023a Step 3 (vault/plans/EZD-023a.md): a static scan of migration SQL. Node 22 built-ins only.
// Finds what a statement drops, renames or creates, and what cannot be checked statically. Names are
// fully qualified (`public.fixture_item.legacy_note`, `public.health`, `extra`); kinds use the words of
// supabase/retired.json (Step 2).

export const OBJECT_KINDS = [
  'table',
  'view',
  'materialized_view',
  'function',
  'procedure',
  'type',
  'domain',
  'schema',
  'sequence',
  'extension',
];

// ---------------------------------------------------------------------------------------------------
// Lexer. One pass over the text; every character lands in exactly one token, so the text can be
// rebuilt from the tokens (stripComments, splitStatements) or filtered down to words (tokenize).
// Token types: ws, comment, string, ident ("quoted"), dollar ($tag$ ... $tag$), word, punct, semi.
// ---------------------------------------------------------------------------------------------------

const WORD_START = /[A-Za-z_]/;
const WORD_CHAR = /[A-Za-z0-9_$]/;

function lex(sql) {
  const tokens = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    // whitespace
    if (/\s/.test(ch)) {
      let j = i + 1;
      while (j < n && /\s/.test(sql[j])) j++;
      tokens.push({ type: 'ws', raw: sql.slice(i, j) });
      i = j;
      continue;
    }
    // line comment: up to, not including, the newline
    if (ch === '-' && sql[i + 1] === '-') {
      let j = i + 2;
      while (j < n && sql[j] !== '\n') j++;
      tokens.push({ type: 'comment', raw: sql.slice(i, j) });
      i = j;
      continue;
    }
    // block comment (nested, as PostgreSQL allows)
    if (ch === '/' && sql[i + 1] === '*') {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (sql[j] === '/' && sql[j + 1] === '*') {
          depth++;
          j += 2;
        } else if (sql[j] === '*' && sql[j + 1] === '/') {
          depth--;
          j += 2;
        } else j++;
      }
      tokens.push({ type: 'comment', raw: sql.slice(i, j) });
      i = j;
      continue;
    }
    // string literal, '' doubles a quote; E'...' also escapes with a backslash
    if (ch === "'" || ((ch === 'E' || ch === 'e') && sql[i + 1] === "'" && !wordBefore(sql, i))) {
      const escaped = ch !== "'";
      let j = i + (escaped ? 2 : 1);
      while (j < n) {
        if (escaped && sql[j] === '\\') {
          j += 2;
          continue;
        }
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          j++;
          break;
        }
        j++;
      }
      const raw = sql.slice(i, j);
      const body = raw.slice(escaped ? 2 : 1, raw.endsWith("'") && raw.length > (escaped ? 2 : 1) ? -1 : undefined);
      tokens.push({ type: 'string', raw, value: body.replace(/''/g, "'") });
      i = j;
      continue;
    }
    // quoted identifier, "" doubles a quote
    if (ch === '"') {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') {
            j += 2;
            continue;
          }
          j++;
          break;
        }
        j++;
      }
      const raw = sql.slice(i, j);
      tokens.push({ type: 'ident', raw, value: raw.slice(1, raw.endsWith('"') ? -1 : undefined).replace(/""/g, '"') });
      i = j;
      continue;
    }
    // dollar-quoted body: $$ ... $$ or $tag$ ... $tag$ ($1 is a parameter, not a quote)
    if (ch === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64));
      if (m) {
        const open = m[0];
        const close = sql.indexOf(open, i + open.length);
        const j = close < 0 ? n : close + open.length;
        const raw = sql.slice(i, j);
        tokens.push({ type: 'dollar', raw, value: raw.slice(open.length, close < 0 ? undefined : -open.length) });
        i = j;
        continue;
      }
    }
    // word (keyword or unquoted identifier)
    if (WORD_START.test(ch)) {
      let j = i + 1;
      while (j < n && WORD_CHAR.test(sql[j])) j++;
      const raw = sql.slice(i, j);
      tokens.push({ type: 'word', raw, value: raw.toLowerCase() });
      i = j;
      continue;
    }
    if (ch === ';') {
      tokens.push({ type: 'semi', raw: ';' });
      i++;
      continue;
    }
    tokens.push({ type: 'punct', raw: ch, value: ch });
    i++;
  }
  return tokens;
}

function wordBefore(sql, i) {
  return i > 0 && WORD_CHAR.test(sql[i - 1]);
}

/** Removes `-- …` and `/* … *\/` comments; string literals and dollar-quoted bodies are kept as written. */
export function stripComments(sql) {
  return lex(sql)
    .filter((t) => t.type !== 'comment')
    .map((t) => t.raw)
    .join('');
}

/** Splits on `;` outside single quotes, double-quoted identifiers and dollar-quoted bodies; drops empties. */
export function splitStatements(sql) {
  const out = [];
  let cur = '';
  for (const t of lex(sql)) {
    if (t.type === 'comment') continue;
    if (t.type === 'semi') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += t.raw;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Meaningful tokens of one statement: words (lower-cased), idents (as written), strings, dollar bodies, punct. */
function tokenize(stmt) {
  return lex(stmt).filter((t) => t.type !== 'ws' && t.type !== 'comment');
}

// ---------------------------------------------------------------------------------------------------
// Small parsing helpers over a token array.
// ---------------------------------------------------------------------------------------------------

const isWord = (t, w) => t !== undefined && t.type === 'word' && t.value === w;
const isPunct = (t, p) => t !== undefined && t.type === 'punct' && t.value === p;
const isNamePart = (t) => t !== undefined && (t.type === 'word' || t.type === 'ident');

/** Skips the words in `seq` when they are next; returns the new index. */
function skipWords(tokens, i, ...seqs) {
  for (const seq of seqs) {
    const words = seq.split(' ');
    let ok = true;
    for (let k = 0; k < words.length; k++) if (!isWord(tokens[i + k], words[k])) ok = false;
    if (ok) return i + words.length;
  }
  return i;
}

/** Reads `a.b.c` starting at `i`; returns { segments, next } or null when no name starts there. */
function readName(tokens, i) {
  if (!isNamePart(tokens[i])) return null;
  const segments = [tokens[i].value];
  let j = i + 1;
  while (isPunct(tokens[j], '.') && isNamePart(tokens[j + 1])) {
    segments.push(tokens[j + 1].value);
    j += 2;
  }
  return { segments, next: j };
}

/** Skips a parenthesised group starting at `i` when one is there; returns the new index. */
function skipParens(tokens, i) {
  if (!isPunct(tokens[i], '(')) return i;
  let depth = 0;
  let j = i;
  for (; j < tokens.length; j++) {
    if (isPunct(tokens[j], '(')) depth++;
    else if (isPunct(tokens[j], ')')) {
      depth--;
      if (depth === 0) return j + 1;
    }
  }
  return j;
}

/** Reads the object kind words at `i`; returns { kind, next } or null. */
function readKind(tokens, i) {
  if (isWord(tokens[i], 'materialized') && isWord(tokens[i + 1], 'view')) {
    return { kind: 'materialized_view', next: i + 2 };
  }
  const t = tokens[i];
  if (t && t.type === 'word' && OBJECT_KINDS.includes(t.value)) return { kind: t.value, next: i + 1 };
  return null;
}

/** A fully qualified name: `schema` kinds stay one segment, everything else gets `public.` when unqualified. */
function qualify(kind, segments) {
  if (kind === 'schema') return segments[segments.length - 1];
  if (segments.length === 1) return `public.${segments[0]}`;
  return segments.slice(-2).join('.');
}

/** Top-level comma-separated actions after index `i` (paren depth 0). */
function splitActions(tokens, i) {
  const actions = [];
  let cur = [];
  let depth = 0;
  for (let j = i; j < tokens.length; j++) {
    const t = tokens[j];
    if (isPunct(t, '(')) depth++;
    else if (isPunct(t, ')')) depth--;
    if (depth === 0 && isPunct(t, ',')) {
      actions.push(cur);
      cur = [];
      continue;
    }
    cur.push(t);
  }
  if (cur.length) actions.push(cur);
  return actions;
}

/** `alter table [if exists] [only] <name> [*]` → { table, next } or null. */
function readAlterTable(tokens) {
  if (!isWord(tokens[0], 'alter') || !isWord(tokens[1], 'table')) return null;
  let i = skipWords(tokens, 2, 'if exists');
  i = skipWords(tokens, i, 'only');
  const name = readName(tokens, i);
  if (!name) return null;
  let next = name.next;
  if (isPunct(tokens[next], '*')) next++;
  return { table: qualify('table', name.segments), next };
}

// ---------------------------------------------------------------------------------------------------
// Public scan functions.
// ---------------------------------------------------------------------------------------------------

const CONTAINER_KINDS = ['table', 'view', 'materialized_view'];
const LIST_SKIP_WORDS = ['constraint', 'primary', 'unique', 'foreign', 'check', 'exclude'];
const last = (segments) => segments[segments.length - 1];
const schemaOf = (qualified) => qualified.slice(0, qualified.lastIndexOf('.'));

/**
 * `alter <kind other than table> [if exists] <n>[(args)] <actions>` → { kind, qualified, actions } or null.
 */
function readAlterOther(tokens) {
  if (!isWord(tokens[0], 'alter')) return null;
  const k = readKind(tokens, 1);
  if (!k) return null;
  const i = skipWords(tokens, k.next, 'if exists');
  const name = readName(tokens, i);
  if (!name) return null;
  const rest = tokens.slice(skipParens(tokens, name.next));
  return { kind: k.kind, qualified: qualify(k.kind, name.segments), actions: splitActions(rest, 0) };
}

/** `rename [column] <a> to <b>` → { from, to } or null (the word `column` is optional for tables and views). */
function readRenameColumn(a) {
  if (!isWord(a[0], 'rename') || isWord(a[1], 'to') || isWord(a[1], 'constraint')) return null;
  const i = skipWords(a, 1, 'column');
  const c = readName(a, i);
  if (!c || !isWord(a[c.next], 'to')) return null;
  const d = readName(a, c.next + 1);
  return { from: last(c.segments), to: d ? last(d.segments) : null };
}

/** Objects the statement drops or renames (Step 3). Indexes, triggers, policies and constraints are not objects the app reads. */
export function findDestructive(stmt) {
  const tokens = tokenize(stmt);
  const out = [];
  const push = (kind, name) => {
    if (!out.some((o) => o.kind === kind && o.name === name)) out.push({ kind, name });
  };

  // drop <kind> [if exists] n1[, n2 …] [cascade|restrict]
  if (isWord(tokens[0], 'drop')) {
    const k = readKind(tokens, 1);
    if (!k) return out;
    let i = skipWords(tokens, k.next, 'if exists');
    for (;;) {
      const name = readName(tokens, i);
      if (!name) break;
      push(k.kind, qualify(k.kind, name.segments));
      i = skipParens(tokens, name.next);
      if (!isPunct(tokens[i], ',')) break;
      i++;
    }
    return out;
  }

  // alter table <t> <actions>
  const at = readAlterTable(tokens);
  if (at) {
    for (const a of splitActions(tokens, at.next)) {
      if (isWord(a[0], 'drop')) {
        if (isWord(a[1], 'constraint')) continue;
        let i = skipWords(a, 1, 'column');
        i = skipWords(a, i, 'if exists');
        const c = readName(a, i);
        if (c) push('column', `${at.table}.${last(c.segments)}`);
      } else if (isWord(a[0], 'rename')) {
        if (isWord(a[1], 'to')) {
          push('table', at.table);
          continue;
        }
        const r = readRenameColumn(a);
        if (r) push('column', `${at.table}.${r.from}`);
      } else if (isWord(a[0], 'set') && isWord(a[1], 'schema')) {
        push('table', at.table);
      }
    }
    return out;
  }

  // alter <other kind> [if exists] <n>[(args)] … rename to | set schema | rename value | rename attribute |
  // drop attribute (types) | rename [column] a to b (views, materialized views)
  const ao = readAlterOther(tokens);
  if (ao) {
    for (const a of ao.actions) {
      if (isWord(a[0], 'rename') && (isWord(a[1], 'to') || isWord(a[1], 'value') || isWord(a[1], 'attribute'))) {
        push(ao.kind, ao.qualified);
      } else if (isWord(a[0], 'set') && isWord(a[1], 'schema')) {
        push(ao.kind, ao.qualified);
      } else if (ao.kind === 'type' && isWord(a[0], 'drop') && isWord(a[1], 'attribute')) {
        push('type', ao.qualified);
      } else if (CONTAINER_KINDS.includes(ao.kind)) {
        const r = readRenameColumn(a);
        if (r) push('column', `${ao.qualified}.${r.from}`);
      }
    }
  }
  return out;
}

/** `create [or replace] [temp…] <kind> [if not exists] <name>` → { kind, name, next } or null. */
function readCreate(tokens) {
  if (!isWord(tokens[0], 'create')) return null;
  let i = skipWords(tokens, 1, 'or replace');
  i = skipWords(tokens, i, 'global', 'local');
  i = skipWords(tokens, i, 'temporary', 'temp', 'unlogged');
  i = skipWords(tokens, i, 'recursive');
  const k = readKind(tokens, i);
  if (!k) return null;
  i = skipWords(tokens, k.next, 'if not exists');
  const name = readName(tokens, i);
  if (!name) return null;
  return { kind: k.kind, name: qualify(k.kind, name.segments), next: name.next };
}

/** `alter table … add [column] [if not exists] <c>` columns, one per action. */
function addedColumns(tokens, at) {
  const out = [];
  for (const a of splitActions(tokens, at.next)) {
    if (!isWord(a[0], 'add')) continue;
    let i = 1;
    if (isWord(a[1], 'column')) i = 2;
    else if (LIST_SKIP_WORDS.some((w) => isWord(a[1], w))) continue;
    i = skipWords(a, i, 'if not exists');
    const c = readName(a, i);
    if (c) out.push({ kind: 'column', name: `${at.table}.${last(c.segments)}` });
  }
  return out;
}

/** Objects the statement creates: `create …` of a listed kind, or `alter table … add [column] …`. */
export function findCreated(stmt) {
  const tokens = tokenize(stmt);
  const c = readCreate(tokens);
  if (c) return [{ kind: c.kind, name: c.name }];
  const at = readAlterTable(tokens);
  if (at) return addedColumns(tokens, at);
  return [];
}

/**
 * Everything a statement defines, for the base object set (Step 3, Q-0156 (a)): what `findCreated` returns,
 * the columns of a `create table (…)` list, and the new name of every rename or move. `allColumns: true`
 * marks a table, view or materialized view whose columns cannot be listed, so every column of it counts.
 */
export function findDefined(stmt) {
  const tokens = tokenize(stmt);
  const out = [];
  const push = (kind, name, allColumns) => out.push(allColumns ? { kind, name, allColumns: true } : { kind, name });

  const c = readCreate(tokens);
  if (c) {
    if (c.kind === 'view' || c.kind === 'materialized_view') {
      push(c.kind, c.name, true);
      return out;
    }
    if (c.kind !== 'table') {
      push(c.kind, c.name);
      return out;
    }
    if (!isPunct(tokens[c.next], '(')) {
      push('table', c.name, true); // `as …`, `of <type>`, `partition of …`: no column list
      return out;
    }
    const close = skipParens(tokens, c.next);
    const elements = splitActions(tokens.slice(c.next + 1, close - 1), 0);
    const columns = [];
    let all = false;
    for (const e of elements) {
      if (!e.length) continue;
      if (isWord(e[0], 'like')) {
        all = true;
        continue;
      }
      if (LIST_SKIP_WORDS.some((w) => isWord(e[0], w))) continue;
      if (isNamePart(e[0])) columns.push(e[0].value);
    }
    if (tokens.slice(close).some((t) => isWord(t, 'inherits'))) all = true;
    push('table', c.name, all);
    for (const col of columns) push('column', `${c.name}.${col}`);
    return out;
  }

  const at = readAlterTable(tokens);
  if (at) {
    out.push(...addedColumns(tokens, at));
    for (const a of splitActions(tokens, at.next)) {
      if (isWord(a[0], 'rename') && isWord(a[1], 'to')) {
        const u = readName(a, 2);
        if (u) push('table', `${schemaOf(at.table)}.${last(u.segments)}`, true);
      } else if (isWord(a[0], 'rename')) {
        const r = readRenameColumn(a);
        if (r && r.to) push('column', `${at.table}.${r.to}`);
      } else if (isWord(a[0], 'set') && isWord(a[1], 'schema')) {
        const s = readName(a, 2);
        if (s) push('table', `${last(s.segments)}.${last(at.table.split('.'))}`, true);
      }
    }
    return out;
  }

  const ao = readAlterOther(tokens);
  if (ao) {
    const container = CONTAINER_KINDS.includes(ao.kind);
    for (const a of ao.actions) {
      if (isWord(a[0], 'rename') && isWord(a[1], 'to')) {
        const m = readName(a, 2);
        if (!m) continue;
        const name = ao.kind === 'schema' ? last(m.segments) : `${schemaOf(ao.qualified)}.${last(m.segments)}`;
        push(ao.kind, name, container);
      } else if (isWord(a[0], 'set') && isWord(a[1], 'schema')) {
        const s = readName(a, 2);
        if (s) push(ao.kind, `${last(s.segments)}.${last(ao.qualified.split('.'))}`, container);
      } else if (container) {
        const r = readRenameColumn(a);
        if (r && r.to) push('column', `${ao.qualified}.${r.to}`);
      }
    }
  }
  return out;
}

const DYNAMIC_RE =
  /\bdrop\s+(?:table|view|materialized\s+view|function|procedure|type|domain|schema|sequence|extension|column|attribute)\b|\brename\s+(?:to|column|value|attribute)\b|\brename\s+(?:"[^"]*"|[a-z_][a-z0-9_$]*)\s+to\b|\bset\s+schema\b/;

/**
 * What cannot be checked statically: a drop ending in `cascade` (dependents are unknown), and destructive
 * text inside a string literal or dollar-quoted body (`execute '…'`, a function body). One entry per reason.
 */
export function findUnverifiable(stmt) {
  const tokens = tokenize(stmt);
  const out = [];
  const endsInCascade = (toks) => toks.length > 0 && isWord(toks[toks.length - 1], 'cascade');

  if (isWord(tokens[0], 'drop') && endsInCascade(tokens)) out.push({ reason: 'cascade' });
  const at = readAlterTable(tokens);
  if (at && !out.length) {
    for (const a of splitActions(tokens, at.next)) {
      if (isWord(a[0], 'drop') && !isWord(a[1], 'constraint') && endsInCascade(a)) {
        out.push({ reason: 'cascade' });
        break;
      }
    }
  }

  for (const t of tokens) {
    if (t.type !== 'string' && t.type !== 'dollar') continue;
    if (DYNAMIC_RE.test(t.value.toLowerCase())) {
      out.push({ reason: 'dynamic' });
      break;
    }
  }
  return out;
}
