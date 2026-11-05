// EZD-117a test helper (vault/plans/EZD-117a.md section 4): read one element of static markup by data-testid,
// counting nested tags of the same name. Not app code.
export type El = { tag: string; attrs: string; inner: string };

export function elements(html: string, testId: string): El[] {
  const out: El[] = [];
  const open = new RegExp(`<([a-z0-9]+)([^>]*data-testid="${testId}"[^>]*)>`, 'g');
  for (let m = open.exec(html); m !== null; m = open.exec(html)) {
    const tag = m[1];
    const start = open.lastIndex;
    const tags = new RegExp(`<(/?)${tag}(?=[\\s>/])[^>]*>`, 'g');
    tags.lastIndex = start;
    let depth = 1;
    let inner = '';
    for (let t = tags.exec(html); t !== null; t = tags.exec(html)) {
      depth += t[1] === '/' ? -1 : t[0].endsWith('/>') ? 0 : 1;
      if (depth === 0) {
        inner = html.slice(start, t.index);
        break;
      }
    }
    out.push({ tag, attrs: m[2], inner });
  }
  return out;
}

export const textOf = (inner: string): string =>
  inner
    .replace(/<!--.*?-->/g, '')
    .replace(/<[^>]*>/g, '')
    .trim();

export const attr = (attrs: string, name: string): string | null => {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs);
  return m ? m[1] : null;
};
