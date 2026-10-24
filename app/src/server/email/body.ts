// EZD-008a Step 2 · pure body builder. The only link in either body is link.url.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildEmailBody(args: {
  paragraphs: string[];
  link: { url: string; label: string };
  lang?: 'en' | 'es';
}): { text: string; html: string } {
  const { paragraphs, link } = args;
  const lang = args.lang ?? 'en';
  const text = (paragraphs.length ? paragraphs.join('\n\n') + '\n\n' : '') + link.url + '\n';
  const html =
    `<!doctype html><html lang="${lang}"><body>` +
    paragraphs.map((p) => `<p>${esc(p)}</p>`).join('') +
    `<p><a href="${esc(link.url)}">${esc(link.label)}</a></p>` +
    `<p>${esc(link.url)}</p>` +
    `</body></html>`;
  return { text, html };
}
