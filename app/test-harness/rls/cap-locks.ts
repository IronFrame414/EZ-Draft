// EZD-321 (vault/plans/EZD-321.md D3-D6): every function that counts rows for a cap takes a lock before
// its first count(...); no policy counts (a policy cannot lock). Read-only counters are a listed allow-list.
import type { Sql, TransactionSql } from './db';

export type CapLockCode =
  | 'count_without_lock'
  | 'unreadable_body'
  | 'listed_counter_volatile'
  | 'stale_read_only_counter'
  | 'policy_counts';
export type CapLockProblem = { fn: string; code: CapLockCode };
export type FunctionBody = {
  fn: string;
  name: string;
  volatility: 'i' | 's' | 'v';
  body: string;
};
export type PolicyText = { policy: string; qual: string; withCheck: string };
export type ReadOnlyCounter = { fn: string; reason: string };

// Non-volatile functions cannot write, so PostgreSQL refuses writes in them (planning probe of pg_proc).
export const CAP_LOCK_READ_ONLY: readonly ReadOnlyCounter[] = [
  {
    fn: 'private.custom_access_token_hook(jsonb)',
    reason: 'Token claim; stable (20261019170004).',
  },
  {
    fn: 'public.list_customers(text, boolean, integer)',
    reason: 'Customers list totals; stable (20261026233829).',
  },
  {
    fn: 'public.list_notifications(timestamp with time zone, uuid)',
    reason: 'Notifications list counts; stable (20261102210539).',
  },
  {
    fn: 'public.count_projects(text)',
    reason: 'Projects tab counts with search; stable (EZD-117b M3).',
  },
];

const WORD_START = /[A-Za-z_]/;
const WORD_CHAR = /[A-Za-z0-9_$]/;

type Texts = { count: string; lock: string };

const blank = (s: string) => ' '.repeat(s.length);

// One pass; returns null when a comment, string, identifier or dollar quote is unterminated.
function lexTexts(sql: string): Texts | null {
  let count = '';
  let lock = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i]!;
    if (/\s/.test(ch)) {
      let j = i + 1;
      while (j < n && /\s/.test(sql[j]!)) j++;
      const raw = sql.slice(i, j);
      count += raw;
      lock += raw;
      i = j;
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') {
      let j = i + 2;
      while (j < n && sql[j] !== '\n') j++;
      const raw = sql.slice(i, j);
      count += blank(raw);
      lock += blank(raw);
      i = j;
      continue;
    }
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
      if (depth > 0) return null;
      const raw = sql.slice(i, j);
      count += blank(raw);
      lock += blank(raw);
      i = j;
      continue;
    }
    const wordBefore = i > 0 && WORD_CHAR.test(sql[i - 1]!);
    if (ch === "'" || ((ch === 'E' || ch === 'e') && sql[i + 1] === "'" && !wordBefore)) {
      const escaped = ch !== "'";
      let j = i + (escaped ? 2 : 1);
      let closed = false;
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
          closed = true;
          break;
        }
        j++;
      }
      if (!closed) return null;
      const raw = sql.slice(i, j);
      count += raw;
      lock += blank(raw);
      i = j;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let closed = false;
      while (j < n) {
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') {
            j += 2;
            continue;
          }
          j++;
          closed = true;
          break;
        }
        j++;
      }
      if (!closed) return null;
      const raw = sql.slice(i, j);
      count += raw === '"count"' ? ' count ' : raw;
      lock += blank(raw);
      i = j;
      continue;
    }
    if (ch === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64));
      if (m) {
        const open = m[0];
        const close = sql.indexOf(open, i + open.length);
        if (close < 0) return null;
        const raw = sql.slice(i, close + open.length);
        count += raw;
        lock += blank(raw);
        i += raw.length;
        continue;
      }
    }
    if (WORD_START.test(ch)) {
      let j = i + 1;
      while (j < n && WORD_CHAR.test(sql[j]!)) j++;
      const raw = sql.slice(i, j);
      count += raw;
      lock += raw;
      i = j;
      continue;
    }
    count += ch;
    lock += ch;
    i++;
  }
  return { count, lock };
}

const COUNT = /\bcount\s*\(/i;
const LOCK = /\bpg_advisory_xact_lock\s*\(|\block\s+table\b|\bfor\s+(?:no\s+key\s+)?update\b/i;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function capLockProblems(
  functions: readonly FunctionBody[],
  policies: readonly PolicyText[],
  readOnly: readonly ReadOnlyCounter[] = CAP_LOCK_READ_ONLY,
): CapLockProblem[] {
  const found = new Map<string, CapLockProblem>();
  const add = (fn: string, code: CapLockCode) => found.set(`${fn}\u0000${code}`, { fn, code });
  const listed = new Set(readOnly.map((r) => r.fn));
  const counting = new Set<string>();
  let anyUnreadable = false;
  const countingNames = new Set<string>();

  for (const f of functions) {
    const texts = lexTexts(f.body);
    if (!texts) {
      add(f.fn, 'unreadable_body');
      anyUnreadable = true;
      continue;
    }
    const c = COUNT.exec(texts.count);
    if (!c) continue;
    counting.add(f.fn);
    countingNames.add(f.name);
    if (listed.has(f.fn)) {
      if (f.volatility === 'v') add(f.fn, 'listed_counter_volatile');
      continue;
    }
    const l = LOCK.exec(texts.lock);
    if (!l || l.index > c.index) add(f.fn, 'count_without_lock');
  }

  // An unreadable body may hide a count, so staleness is judged only when every body was read.
  for (const r of readOnly) {
    if (!anyUnreadable && !counting.has(r.fn)) add(r.fn, 'stale_read_only_counter');
  }

  const callers = [...countingNames].map(
    (name) => new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`, 'i'),
  );
  for (const p of policies) {
    let unreadable = false;
    let counts = false;
    for (const text of [p.qual, p.withCheck]) {
      const texts = lexTexts(text);
      if (!texts) {
        unreadable = true;
        continue;
      }
      if (COUNT.test(texts.count) || callers.some((re) => re.test(texts.count))) counts = true;
    }
    if (unreadable) add(p.policy, 'unreadable_body');
    if (counts) add(p.policy, 'policy_counts');
  }

  return [...found.values()].sort((a, b) =>
    a.fn < b.fn ? -1 : a.fn > b.fn ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0,
  );
}

export async function auditCapLocks(
  sql: Sql | TransactionSql,
  options: { readOnly?: readonly ReadOnlyCounter[] } = {},
): Promise<CapLockProblem[]> {
  const q = sql as Sql;
  const functions = await q<FunctionBody[]>`
    select format('%I.%I(%s)', n.nspname, p.proname, oidvectortypes(p.proargtypes)) as fn,
      p.proname::text as name, p.provolatile::text as volatility, case when p.prosqlbody is not null then pg_get_function_sqlbody(p.oid) else p.prosrc end as body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass
        and d.objid = p.oid and d.deptype = 'e')
    order by 1`;
  const policyRows = await q<{ policy: string; qual: string; with_check: string }[]>`
    select format('policy %I.%I %I', schemaname, tablename, policyname) as policy,
      coalesce(qual, '') as qual, coalesce(with_check, '') as with_check
    from pg_policies order by 1`;
  const policies = policyRows.map((r) => ({
    policy: r.policy,
    qual: r.qual,
    withCheck: r.with_check,
  }));
  return capLockProblems(functions, policies, options.readOnly ?? CAP_LOCK_READ_ONLY);
}
