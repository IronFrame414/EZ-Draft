// EZD-377: the one limit matcher. classifyLimit (scripts/run.mjs) and strikeExempt (vault/tools/next_ticket.mjs) both call
// matchLimit, so the two cannot disagree (vault/plans/EZD-377.md D-Doc, D-Legacy, D-None). No imports.

// Claude Code's documented limit messages (https://code.claude.com/docs/en/errors.md, Usage limits), e.g.
// "You've hit your weekly limit · resets Mon 12:00am" and "You've hit your session limit · resets 3:45pm".
export const DOCUMENTED_LIMIT_RE = /You['’]ve hit your ([^·\n]+?) (limit|budget)(?:\s*·\s*([^\n]*))?/i;
// The launcher's earlier pattern (scripts/run.mjs LIMIT_RE before EZD-377), character for character.
export const LEGACY_LIMIT_RE = /(usage|rate) limit|limit (reached|exceeded|hit)|out of (extra )?usage|too many requests|quota/i;

const DOCUMENTED_ALL_RE = new RegExp(DOCUMENTED_LIMIT_RE.source, 'gi');

// null, or { documented, scope, kind, until, text }. Never throws. Every documented message in the text is read: when any has
// a scope other than session, the first such message wins, so a session line before a weekly one cannot turn the weekly stop
// into a pause (security review 2026-11-10, finding 2).
export function matchLimit(text) {
  if (typeof text !== 'string') return null;
  const all = [...text.matchAll(DOCUMENTED_ALL_RE)];
  const d = all.find((x) => !/^session$/i.test(x[1].trim())) ?? all[0];
  if (d) {
    const scope = d[1].trim();
    const tail = d[3] === undefined ? '' : d[3].trim();
    const until = /^resets /i.test(tail) ? tail.slice('resets '.length).trim() : '';
    return {
      documented: true,
      scope,
      kind: /^session$/i.test(scope) ? 'five-hour' : 'weekly',
      until: until === '' ? null : until,
      text: d[0].trim(),
    };
  }
  const l = text.match(LEGACY_LIMIT_RE);
  if (l) return { documented: false, scope: null, kind: null, until: null, text: l[0] };
  return null;
}
