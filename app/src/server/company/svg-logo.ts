// EZD-290 Step 3 (vault/plans/EZD-290.md Decided D-parse, D-root, D-refuse, D-keep, V-href, V-css,
// `SVG_ELEMENTS`, `SVG_ATTRIBUTES`, D-serialize; AC-EZD-290-1, -2; Q-0232): an uploaded SVG logo is read by a
// strict parser and written again from that parse, keeping only allowlisted elements and attributes. Anything
// the parser does not read is refused. One cursor, an element stack, no recursion.

export const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

export const SVG_ELEMENTS: ReadonlySet<string> = new Set([
  'svg',
  'g',
  'defs',
  'symbol',
  'use',
  'switch',
  'title',
  'desc',
  'style',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'pattern',
  'image',
  'filter',
  'feBlend',
  'feColorMatrix',
  'feComposite',
  'feDropShadow',
  'feFlood',
  'feGaussianBlur',
  'feMerge',
  'feMergeNode',
  'feOffset',
]);

export const SVG_ATTRIBUTES: ReadonlySet<string> = new Set([
  'id',
  'class',
  'style',
  'viewBox',
  'preserveAspectRatio',
  'x',
  'y',
  'width',
  'height',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'fx',
  'fy',
  'd',
  'points',
  'transform',
  'href',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'display',
  'clip-path',
  'clip-rule',
  'mask',
  'filter',
  'stop-color',
  'stop-opacity',
  'flood-color',
  'flood-opacity',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'text-anchor',
  'dominant-baseline',
  'letter-spacing',
  'dx',
  'dy',
  'rotate',
  'gradientUnits',
  'gradientTransform',
  'spreadMethod',
  'offset',
  'patternUnits',
  'patternContentUnits',
  'patternTransform',
  'clipPathUnits',
  'maskUnits',
  'maskContentUnits',
  'filterUnits',
  'in',
  'in2',
  'result',
  'mode',
  'operator',
  'values',
  'type',
  'stdDeviation',
]);

export type SvgClean =
  { ok: true; svg: string } | { ok: false; code: 'logo_svg_unsafe' | 'logo_wrong_type' };

const UNSAFE: SvgClean = { ok: false, code: 'logo_svg_unsafe' };

// V-css applies to these attributes and to the text of a `style` element.
const CSS_ATTRIBUTES: ReadonlySet<string> = new Set([
  'style',
  'fill',
  'stroke',
  'clip-path',
  'mask',
  'filter',
]);
const CSS_FUNCTIONS: ReadonlySet<string> = new Set(['', 'rgb', 'rgba', 'hsl', 'hsla', 'url']);

const QNAME = /[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?/y;
const REFERENCE = /&(lt|gt|amp|quot|apos|#[0-9]+|#x[0-9A-Fa-f]+);/y;
const URL_OPEN = /url\(/gi;
const URL_TARGET = /[\t\n\f\r ]*["']?#/y;
const HREF_FRAGMENT = /^#[A-Za-z_][A-Za-z0-9_.:-]*$/;
const HREF_IMAGE_DATA = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=\s]+$/;

function isXmlChar(cp: number): boolean {
  return (
    cp === 0x9 ||
    cp === 0xa ||
    (cp >= 0x20 && cp <= 0xd7ff) ||
    (cp >= 0xe000 && cp <= 0xfffd) ||
    (cp >= 0x10000 && cp <= 0x10ffff)
  );
}

// D-parse a: every character (surrogate pairs read as one) is an XML Char.
function allXmlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i++;
    } else if (!isXmlChar(c)) {
      return false;
    }
  }
  return true;
}

// D-parse d: only the five named references and numeric references that give an XML Char; null refuses.
function decodeReferences(s: string): string | null {
  let amp = s.indexOf('&');
  if (amp < 0) return s;
  let out = '';
  let last = 0;
  while (amp >= 0) {
    REFERENCE.lastIndex = amp;
    const m = REFERENCE.exec(s);
    if (!m) return null;
    const ref = m[1];
    let ch: string;
    if (ref === 'lt') ch = '<';
    else if (ref === 'gt') ch = '>';
    else if (ref === 'amp') ch = '&';
    else if (ref === 'quot') ch = '"';
    else if (ref === 'apos') ch = "'";
    else {
      const cp = ref[1] === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      if (!Number.isFinite(cp) || !isXmlChar(cp)) return null;
      ch = String.fromCodePoint(cp);
    }
    out += s.slice(last, amp) + ch;
    last = REFERENCE.lastIndex;
    amp = s.indexOf('&', last);
  }
  return out + s.slice(last);
}

function isWs(c: string | undefined): boolean {
  return c === ' ' || c === '\t' || c === '\n';
}

// R3: with U+0000-0020 and U+007F-009F removed and lower-cased, a script URL is refused.
function holdsScriptUrl(value: string): boolean {
  let kept = '';
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c > 0x20 && (c < 0x7f || c > 0x9f)) kept += value[i];
  }
  const s = kept.toLowerCase();
  return s.includes('javascript:') || s.includes('vbscript:');
}

function isCssNameChar(c: number): boolean {
  return (
    (c >= 0x30 && c <= 0x39) ||
    (c >= 0x41 && c <= 0x5a) ||
    (c >= 0x61 && c <= 0x7a) ||
    c === 0x5f ||
    c === 0x2d ||
    c >= 0x80
  );
}

// V-css.
function cssOk(v: string): boolean {
  if (v.includes('\\') || v.includes('@')) return false;
  for (let i = v.indexOf('('); i >= 0; i = v.indexOf('(', i + 1)) {
    let j = i;
    while (j > 0 && isCssNameChar(v.charCodeAt(j - 1))) j--;
    if (!CSS_FUNCTIONS.has(v.slice(j, i).toLowerCase())) return false;
  }
  // Positions come from `v` itself, never from a case-changed copy (lower-casing can change the length).
  for (const m of v.matchAll(URL_OPEN)) {
    URL_TARGET.lastIndex = m.index + 4;
    if (!URL_TARGET.test(v)) return false;
  }
  return true;
}

// V-href.
function hrefOk(value: string, elementLocal: string): boolean {
  const t = value.trim();
  return HREF_FRAGMENT.test(t) || (elementLocal === 'image' && HREF_IMAGE_DATA.test(t));
}

function attributeValueOk(local: string, value: string, elementLocal: string): boolean {
  if (local === 'href') return hrefOk(value, elementLocal);
  if (CSS_ATTRIBUTES.has(local)) return cssOk(value);
  return true;
}

const ATTR_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\t': '&#9;',
  '\n': '&#10;',
  '\r': '&#13;',
};
const TEXT_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '\r': '&#13;',
};

function escapeAttribute(v: string): string {
  return v.replace(/[&<>"\t\n\r]/g, (c) => ATTR_ESCAPES[c] as string);
}

function escapeText(v: string): string {
  return v.replace(/[&<>\r]/g, (c) => TEXT_ESCAPES[c] as string);
}

function splitQName(qname: string): { prefix: string | null; local: string } {
  const colon = qname.indexOf(':');
  return colon < 0
    ? { prefix: null, local: qname }
    : { prefix: qname.slice(0, colon), local: qname.slice(colon + 1) };
}

function isNamespaceDeclaration(qname: string): boolean {
  return qname === 'xmlns' || qname.startsWith('xmlns:');
}

type Frame = {
  qname: string;
  local: string;
  kept: boolean;
  // Index in `out` of this element's start tag; -1 when the element is dropped.
  at: number;
  open: string;
  hasElementChild: boolean;
  styleText: string[] | null;
  declared: string[];
};

export function cleanSvg(input: string): SvgClean {
  // D-parse a.
  const src = input.replace(/\r\n?/g, '\n');
  if (!allXmlChars(src)) return UNSAFE;

  // D-parse f: prefix -> stack of bound namespaces; '' is the default namespace.
  const bindings = new Map<string, string[]>([['xml', [XML_NS]]]);
  const lookup = (prefix: string): string | undefined => {
    const values = bindings.get(prefix);
    return values && values.length > 0 ? values[values.length - 1] : undefined;
  };

  const stack: Frame[] = [];
  const out: string[] = [];
  let rootNs: string | null = null;
  let rootLocal = '';
  let rootSeen = false;
  let rootDone = false;
  let doctypeSeen = false;
  let refused = false;

  const addText = (text: string): void => {
    const top = stack[stack.length - 1];
    if (!top || text === '') return;
    if (top.styleText) top.styleText.push(text);
    if (top.kept) out.push(escapeText(text));
  };

  const closeTop = (): void => {
    const frame = stack.pop() as Frame;
    for (const prefix of frame.declared) bindings.get(prefix)?.pop();
    if (frame.styleText) {
      const text = frame.styleText.join('');
      if (holdsScriptUrl(text)) refused = true;
      if (frame.kept && (frame.hasElementChild || !cssOk(text))) {
        out.length = frame.at;
        frame.kept = false;
      }
    }
    if (frame.kept) {
      if (out.length === frame.at + 1) {
        out[frame.at] = `${frame.open}/>`;
      } else {
        out[frame.at] = `${frame.open}>`;
        out.push(`</${frame.local}>`);
      }
    }
    if (stack.length === 0) rootDone = true;
  };

  const readQName = (at: number): string | null => {
    QNAME.lastIndex = at;
    const m = QNAME.exec(src);
    return m ? m[0] : null;
  };

  let pos = 0;
  const len = src.length;
  while (pos < len) {
    const lt = src.indexOf('<', pos);
    const textEnd = lt < 0 ? len : lt;
    if (textEnd > pos) {
      const raw = src.slice(pos, textEnd);
      if (stack.length === 0) {
        // D-parse e: outside the root only whitespace.
        for (let i = 0; i < raw.length; i++) if (!isWs(raw[i])) return UNSAFE;
      } else {
        const text = decodeReferences(raw);
        if (text === null) return UNSAFE;
        addText(text);
      }
    }
    if (lt < 0) break;
    pos = lt;

    if (src.startsWith('<!--', pos)) {
      const end = src.indexOf('-->', pos + 4);
      if (end < 0) return UNSAFE;
      pos = end + 3;
    } else if (src.startsWith('<?', pos)) {
      const end = src.indexOf('?>', pos + 2);
      if (end < 0) return UNSAFE;
      pos = end + 2;
    } else if (src.startsWith('<!DOCTYPE', pos)) {
      if (rootSeen || doctypeSeen) return UNSAFE;
      const end = src.indexOf('>', pos);
      if (end < 0 || src.slice(pos, end).includes('[')) return UNSAFE;
      doctypeSeen = true;
      pos = end + 1;
    } else if (src.startsWith('<![CDATA[', pos)) {
      if (stack.length === 0) return UNSAFE;
      const end = src.indexOf(']]>', pos + 9);
      if (end < 0) return UNSAFE;
      addText(src.slice(pos + 9, end));
      pos = end + 3;
    } else if (src.startsWith('</', pos)) {
      const name = readQName(pos + 2);
      if (name === null) return UNSAFE;
      let i = pos + 2 + name.length;
      while (isWs(src[i])) i++;
      if (src[i] !== '>') return UNSAFE;
      const top = stack[stack.length - 1];
      if (!top || top.qname !== name) return UNSAFE;
      closeTop();
      pos = i + 1;
    } else {
      // Start tag.
      const name = readQName(pos + 1);
      if (name === null) return UNSAFE;
      let i = pos + 1 + name.length;
      const attrs: Array<{ qname: string; value: string }> = [];
      const seen = new Set<string>();
      let selfClosing: boolean;
      for (;;) {
        const wsStart = i;
        while (isWs(src[i])) i++;
        if (src[i] === '>') {
          selfClosing = false;
          i++;
          break;
        }
        if (src.startsWith('/>', i)) {
          selfClosing = true;
          i += 2;
          break;
        }
        if (i === wsStart) return UNSAFE;
        const attrName = readQName(i);
        if (attrName === null) return UNSAFE;
        i += attrName.length;
        while (isWs(src[i])) i++;
        if (src[i] !== '=') return UNSAFE;
        i++;
        while (isWs(src[i])) i++;
        const quote = src[i];
        if (quote !== '"' && quote !== "'") return UNSAFE;
        const end = src.indexOf(quote, i + 1);
        if (end < 0) return UNSAFE;
        const raw = src.slice(i + 1, end);
        if (raw.includes('<')) return UNSAFE;
        i = end + 1;
        if (seen.has(attrName)) return UNSAFE;
        seen.add(attrName);
        const value = decodeReferences(raw.replace(/[\t\n]/g, ' '));
        if (value === null) return UNSAFE;
        attrs.push({ qname: attrName, value });
      }
      pos = i;

      // D-parse e: one root.
      if (stack.length === 0 && rootDone) return UNSAFE;

      // D-parse f: this element's declarations apply to itself and its attributes.
      const declared: string[] = [];
      for (const a of attrs) {
        if (!isNamespaceDeclaration(a.qname)) continue;
        const prefix = a.qname === 'xmlns' ? '' : a.qname.slice(6);
        let values = bindings.get(prefix);
        if (!values) {
          values = [];
          bindings.set(prefix, values);
        }
        values.push(a.value);
        declared.push(prefix);
      }
      const el = splitQName(name);
      let ns: string | null;
      if (el.prefix === null) {
        const d = lookup('');
        ns = d === undefined || d === '' ? null : d;
      } else {
        const bound = lookup(el.prefix);
        if (bound === undefined) return UNSAFE;
        ns = bound;
      }

      // D-refuse R1.
      const lowerLocal = el.local.toLowerCase();
      if (lowerLocal === 'script' || lowerLocal === 'foreignobject') refused = true;

      const parent = stack[stack.length - 1];
      if (parent) parent.hasElementChild = true;
      else {
        rootSeen = true;
        rootNs = ns;
        rootLocal = el.local;
      }
      const kept = (parent ? parent.kept : true) && ns === SVG_NS && SVG_ELEMENTS.has(el.local);

      // Attributes: namespaces (D-parse f), refusals R2 and R3, the keep rules (D-keep).
      const keptAttrs: Array<{ name: string; value: string; xlinkHref: boolean }> = [];
      let plainHrefKept = false;
      // Namespaces in XML: no two attributes of an element have the same (namespace, local name).
      const expanded = new Set<string>();
      for (const a of attrs) {
        if (holdsScriptUrl(a.value)) refused = true;
        if (isNamespaceDeclaration(a.qname)) continue;
        const an = splitQName(a.qname);
        let ans: string | null = null;
        if (an.prefix !== null) {
          const bound = lookup(an.prefix);
          if (bound === undefined) return UNSAFE;
          ans = bound;
        }
        const key = ans === null ? an.local : `{${ans}}${an.local}`;
        if (expanded.has(key)) return UNSAFE;
        expanded.add(key);
        if (an.local.toLowerCase().startsWith('on')) refused = true;
        if (!kept) continue;
        if (ans === null) {
          if (SVG_ATTRIBUTES.has(an.local) && attributeValueOk(an.local, a.value, el.local)) {
            keptAttrs.push({ name: an.local, value: a.value, xlinkHref: false });
            if (an.local === 'href') plainHrefKept = true;
          }
        } else if (ans === XLINK_NS && an.local === 'href') {
          if (hrefOk(a.value, el.local)) {
            keptAttrs.push({ name: 'href', value: a.value, xlinkHref: true });
          }
        } else if (ans === XML_NS && an.local === 'space') {
          if (a.value === 'default' || a.value === 'preserve') {
            keptAttrs.push({ name: 'xml:space', value: a.value, xlinkHref: false });
          }
        }
      }

      let open = '';
      let at = -1;
      if (kept) {
        open = `<${el.local}${parent ? '' : ` xmlns="${SVG_NS}"`}`;
        for (const a of keptAttrs) {
          if (a.xlinkHref && plainHrefKept) continue;
          open += ` ${a.name}="${escapeAttribute(a.value)}"`;
        }
        at = out.length;
        out.push(open);
      }
      stack.push({
        qname: name,
        local: el.local,
        kept,
        at,
        open,
        hasElementChild: false,
        styleText: el.local === 'style' ? [] : null,
        declared,
      });
      if (selfClosing) closeTop();
    }
  }

  // D-parse e: an element still open, or no root.
  if (stack.length > 0 || !rootSeen) return UNSAFE;
  // D-root.
  if (rootNs !== SVG_NS || rootLocal !== 'svg') return { ok: false, code: 'logo_wrong_type' };
  // D-refuse.
  if (refused) return UNSAFE;
  return { ok: true, svg: out.join('') };
}
