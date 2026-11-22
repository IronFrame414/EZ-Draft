// EZD-710 (S13 Data shown "Title block", Decisions 5, 6, 10; S15b Decisions 1-3; 09h Sheet set rules "Title block";
// Q-0182; R24 #7; boards S13Sheets, S15bTitleBlock; AC-EZD-710-1): the sheet title block as SVG markup in paper
// inches, for the sheet preview and later the PDF (R7: one drawing feeds both). Pure; no DOM.
//
// The layout is fixed (S15b Decision 1) and designed for the 24x36 column (4.5" wide, 23" tall inside the border);
// every height and text size scales with the column height, so 11x17 is the same block smaller (board S15b "text
// scales with the sheet"). At 24x36 the seal box is 3" x 3" (S13 Data shown) and the department approval stamp area
// is a separate 3" x 3" box below it (board S15b "PBC 3" x 3""); they stack because two 3" boxes do not fit side by
// side in 4.5" (vault/build/assumptions.md EZD-710). A set without stamp areas (the client set, S13 Decision 10)
// draws neither box and gives the room to the revisions table. Every text is escaped: names are typed by users.
import { escapeXml } from './sheet-svg';
import { DRAWING_FONTS, measureTextPt } from './text';

// The design column at 24x36, paper inches.
export const TITLE_BLOCK_DESIGN = { width: 4.5, height: 23 } as const;
// The seal box and the stamp area at 24x36, paper inches (S13 Data shown "3\" x 3\" clear").
export const SEAL_BOX_IN = 3;
export const STAMP_AREA_IN = 3;

export type TitleBlockRect = { x: number; y: number; width: number; height: number };

export type TitleBlockRevisionRow = { no: string; date: string; description: string };

// What one sheet's title block prints, already in sheet words (permit sheets are English only, S13 Decision 7).
// An unfilled value is ''.
export type TitleBlockValues = {
  // Null when the company block is switched off (S15b "Show company logo, license and contact").
  company: { name: string; license: string; contact: string[]; logoUrl: string | null } | null;
  projectName: string;
  address: string;
  codeEdition: string;
  scopeOfWork: string;
  owner: string;
  parcel: string;
  revisions: readonly TitleBlockRevisionRow[];
  // The seal box and the department approval stamp area (permit set only, S13 Decisions 5, 10).
  stampAreas: boolean;
  drawn: string;
  checked: string;
  date: string;
  scale: string;
  sheetTitle: string;
  sheetNumber: string;
  revision: string;
  // "4 OF 10".
  sheetOf: string;
};

// The named boxes of the block, paper inches, top to bottom.
export type TitleBlockLayout = {
  column: TitleBlockRect;
  // Paper inches per design inch (1 at 24x36).
  k: number;
  company: TitleBlockRect;
  project: TitleBlockRect;
  revisions: TitleBlockRect;
  seal: TitleBlockRect | null;
  stamp: TitleBlockRect | null;
  signature: TitleBlockRect | null;
  drawn: TitleBlockRect;
  checked: TitleBlockRect;
  date: TitleBlockRect;
  scale: TitleBlockRect;
  sheetTitle: TitleBlockRect;
  sheet: TitleBlockRect;
};

// Design heights at 24x36, inches. The seal section holds a label row, the seal box, a label row, the stamp area and
// the signature and date line.
const H = {
  company: 2.25,
  project: 3.5,
  revisions: 2.5,
  sealLabel: 0.25,
  gap: 0.15,
  signature: 0.45,
  cellRow: 0.6,
  sheetTitle: 0.9,
};
const SEAL_SECTION = 2 * H.sealLabel + SEAL_BOX_IN + STAMP_AREA_IN + 3 * H.gap + H.signature;

export function titleBlockLayout(column: TitleBlockRect, stampAreas: boolean): TitleBlockLayout {
  const k = column.height / TITLE_BLOCK_DESIGN.height;
  const { x, width } = column;
  let y = column.y;
  const take = (h: number): TitleBlockRect => {
    const r = { x, y, width, height: h * k };
    y += h * k;
    return r;
  };
  const company = take(H.company);
  const project = take(H.project);
  const revisions = take(H.revisions + (stampAreas ? 0 : SEAL_SECTION));
  let seal: TitleBlockRect | null = null;
  let stamp: TitleBlockRect | null = null;
  let signature: TitleBlockRect | null = null;
  if (stampAreas) {
    const section = take(SEAL_SECTION);
    const boxX = x + (width - SEAL_BOX_IN * k) / 2;
    let sy = section.y + H.sealLabel * k;
    seal = { x: boxX, y: sy, width: SEAL_BOX_IN * k, height: SEAL_BOX_IN * k };
    sy += (SEAL_BOX_IN + H.gap + H.sealLabel) * k;
    stamp = { x: boxX, y: sy, width: STAMP_AREA_IN * k, height: STAMP_AREA_IN * k };
    sy += (STAMP_AREA_IN + H.gap) * k;
    signature = { x, y: sy, width, height: H.signature * k };
  }
  const row1 = take(H.cellRow);
  const row2 = take(H.cellRow);
  const half = width / 2;
  const drawn = { ...row1, width: half };
  const checked = { ...row1, x: x + half, width: half };
  const date = { ...row2, width: half };
  const scale = { ...row2, x: x + half, width: half };
  const sheetTitle = take(H.sheetTitle);
  const sheet = { x, y, width, height: column.y + column.height - y };
  return {
    column,
    k,
    company,
    project,
    revisions,
    seal,
    stamp,
    signature,
    drawn,
    checked,
    date,
    scale,
    sheetTitle,
    sheet,
  };
}

const INK = '#000000';
const GREY = '#6b6b6b';
const MONO = "'DM Mono', monospace";
const SANS = "'Instrument Sans', sans-serif";
// Text sizes at 24x36, points.
const PT = { label: 5, value: 7, project: 9, company: 13, title: 10, number: 54, rev: 7 };
const PEN = 0.18 / 25.4;
const HEAVY = 0.35 / 25.4;

const num = (n: number): string => {
  const r = Math.round(n * 1e5) / 1e5;
  return Object.is(r, -0) ? '0' : String(r);
};

// Breaks text into lines no wider than `width` paper inches in DM Mono at `sizeIn`; a word longer than a line is cut.
export function wrapText(text: string, width: number, sizeIn: number, maxLines: number): string[] {
  const fits = (s: string) => measureTextPt(DRAWING_FONTS['dm-mono-400'], s, sizeIn * 72) / 72 <= width;
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter((w) => w.length > 0)) {
      const next = line === '' ? word : `${line} ${word}`;
      if (fits(next)) {
        line = next;
        continue;
      }
      if (line !== '') lines.push(line);
      line = word;
      while (!fits(line) && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && !fits(line.slice(0, cut))) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    if (line !== '') lines.push(line);
  }
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/.$/, '')}…`;
  return kept;
}

type TextOpts = {
  sizePt: number;
  family?: string;
  anchor?: 'start' | 'middle' | 'end';
  fill?: string;
  weight?: number;
  field?: string;
};

export function titleBlockSvg(values: TitleBlockValues, column: TitleBlockRect): string {
  const L = titleBlockLayout(column, values.stampAreas);
  const { k } = L;
  const pad = 0.1 * k;
  const out: string[] = [];
  const size = (pt: number) => (pt / 72) * k;
  const text = (x: number, y: number, s: string, o: TextOpts) => {
    const field = o.field === undefined ? '' : ` data-field="${o.field}"`;
    const weight = o.weight === undefined ? '' : ` font-weight="${o.weight}"`;
    out.push(
      `<text x="${num(x)}" y="${num(y)}" font-family="${escapeXml(o.family ?? MONO)}" font-size="${num(size(o.sizePt))}"${weight} text-anchor="${o.anchor ?? 'start'}" fill="${o.fill ?? INK}"${field}>${escapeXml(s)}</text>`,
    );
  };
  const label = (r: TitleBlockRect, s: string, dy = 0) =>
    text(r.x + pad, r.y + pad + size(PT.label) + dy, s, { sizePt: PT.label, fill: GREY });
  const rule = (y: number, x1 = L.column.x, x2 = L.column.x + L.column.width) =>
    out.push(
      `<line x1="${num(x1)}" y1="${num(y)}" x2="${num(x2)}" y2="${num(y)}" stroke="${INK}" stroke-width="${num(PEN)}"/>`,
    );
  const vrule = (x: number, y1: number, y2: number) =>
    out.push(
      `<line x1="${num(x)}" y1="${num(y1)}" x2="${num(x)}" y2="${num(y2)}" stroke="${INK}" stroke-width="${num(PEN)}"/>`,
    );
  const box = (r: TitleBlockRect, part: string, dashed: boolean) =>
    out.push(
      `<rect x="${num(r.x)}" y="${num(r.y)}" width="${num(r.width)}" height="${num(r.height)}" fill="none" stroke="${INK}" stroke-width="${num(PEN)}"${dashed ? ` stroke-dasharray="${num(0.06 * k)} ${num(0.04 * k)}"` : ''} data-part="${part}"/>`,
    );
  const line = (lh: number) => size(lh) * 1.35;
  const innerW = L.column.width - 2 * pad;

  out.push(`<g data-testid="title-block" data-part="title-block">`);

  // Company: logo, name, license, contact (S15b switch).
  const c = L.company;
  if (values.company !== null) {
    let cy = c.y + pad;
    if (values.company.logoUrl !== null) {
      const lh = 0.6 * k;
      out.push(
        `<image href="${escapeXml(values.company.logoUrl)}" x="${num(c.x + pad)}" y="${num(cy)}" width="${num(innerW)}" height="${num(lh)}" preserveAspectRatio="xMidYMid meet" data-part="logo"/>`,
      );
      cy += lh + 0.05 * k;
    }
    for (const l of wrapText(values.company.name.toUpperCase(), innerW, size(PT.company), 2)) {
      cy += line(PT.company);
      text(c.x + c.width / 2, cy, l, {
        sizePt: PT.company,
        family: SANS,
        anchor: 'middle',
        weight: 600,
        field: 'company',
      });
    }
    for (const l of values.company.contact) {
      cy += line(PT.label);
      text(c.x + c.width / 2, cy, l, { sizePt: PT.label, anchor: 'middle', fill: GREY, field: 'contact' });
    }
    const ly = c.y + c.height - pad;
    text(c.x + pad, ly, 'LICENSE', { sizePt: PT.label, fill: GREY });
    text(c.x + c.width - pad, ly, values.company.license, {
      sizePt: PT.value,
      anchor: 'end',
      field: 'license',
    });
  }
  rule(c.y + c.height);

  // Project: name, address, code edition and scope of work under the address (S13 Decision 6), owner, PCN.
  const p = L.project;
  label(p, 'PROJECT');
  let py = p.y + pad + size(PT.label);
  py += line(PT.project);
  text(p.x + pad, py, values.projectName.toUpperCase(), { sizePt: PT.project, weight: 600, field: 'project' });
  for (const l of wrapText(values.address, innerW, size(PT.value), 2)) {
    py += line(PT.value);
    text(p.x + pad, py, l, { sizePt: PT.value, field: 'address' });
  }
  py += line(PT.value);
  text(p.x + pad, py, values.codeEdition, { sizePt: PT.value, field: 'code_edition' });
  for (const l of wrapText(values.scopeOfWork, innerW, size(PT.value), 4)) {
    py += line(PT.value);
    text(p.x + pad, py, l, { sizePt: PT.value, field: 'scope_of_work' });
  }
  const oy = p.y + p.height - pad - line(PT.label) * 2 - line(PT.value);
  text(p.x + pad, oy, 'OWNER', { sizePt: PT.label, fill: GREY });
  text(p.x + p.width - pad, oy, values.owner, { sizePt: PT.value, anchor: 'end', field: 'owner' });
  const pcy = oy + line(PT.value);
  text(p.x + pad, pcy, 'PCN', { sizePt: PT.label, fill: GREY });
  text(p.x + p.width - pad, pcy, values.parcel, { sizePt: PT.value, anchor: 'end', field: 'parcel' });
  text(p.x + pad, pcy + line(PT.label), 'From property appraiser link', { sizePt: PT.label, fill: GREY });
  rule(p.y + p.height);

  // Revisions table: no, date, description.
  const r = L.revisions;
  label(r, 'REVISIONS');
  const colNo = r.x + pad;
  const colDate = r.x + 0.45 * k;
  const colDesc = r.x + 1.45 * k;
  let ry = r.y + pad + size(PT.label) + line(PT.label);
  text(colNo, ry, 'NO', { sizePt: PT.label, fill: GREY });
  text(colDate, ry, 'DATE', { sizePt: PT.label, fill: GREY });
  text(colDesc, ry, 'DESCRIPTION', { sizePt: PT.label, fill: GREY });
  rule(ry + 0.06 * k);
  for (const row of values.revisions) {
    ry += line(PT.value);
    if (ry > r.y + r.height - pad) break;
    text(colNo, ry, row.no, { sizePt: PT.value, field: 'revision_no' });
    text(colDate, ry, row.date, { sizePt: PT.value, field: 'revision_date' });
    text(colDesc, ry, row.description, { sizePt: PT.value, field: 'revision_description' });
  }
  rule(r.y + r.height);

  // Seal box and department approval stamp area, both blank (S13 Decision 5), then signature and date.
  if (L.seal !== null && L.stamp !== null && L.signature !== null) {
    text(L.seal.x, L.seal.y - 0.07 * k, 'SEAL', { sizePt: PT.label, fill: GREY });
    box(L.seal, 'seal', true);
    text(L.stamp.x, L.stamp.y - 0.07 * k, 'DEPT. APPROVAL', { sizePt: PT.label, fill: GREY });
    box(L.stamp, 'stamp', true);
    const s = L.signature;
    const sy = s.y + s.height - pad;
    rule(sy - size(PT.label) - 0.04 * k, s.x + pad, s.x + s.width * 0.6);
    rule(sy - size(PT.label) - 0.04 * k, s.x + s.width * 0.65, s.x + s.width - pad);
    text(s.x + pad, sy, 'SIGNATURE', { sizePt: PT.label, fill: GREY });
    text(s.x + s.width * 0.65, sy, 'DATE', { sizePt: PT.label, fill: GREY });
    rule(s.y + s.height);
  }

  // Drawn, checked, date, scale.
  const cell = (b: TitleBlockRect, name: string, value: string, field: string) => {
    label(b, name);
    text(b.x + pad, b.y + b.height - pad, value, { sizePt: PT.value, field });
  };
  cell(L.drawn, 'DRAWN', values.drawn, 'drawn');
  cell(L.checked, 'CHECKED', values.checked, 'checked');
  cell(L.date, 'DATE', values.date, 'date');
  cell(L.scale, 'SCALE', values.scale, 'scale');
  vrule(L.drawn.x + L.drawn.width, L.drawn.y, L.date.y + L.date.height);
  rule(L.drawn.y + L.drawn.height);
  rule(L.date.y + L.date.height);

  // Sheet title.
  const t = L.sheetTitle;
  label(t, 'SHEET TITLE');
  text(t.x + pad, t.y + t.height - pad, values.sheetTitle.toUpperCase(), {
    sizePt: PT.title,
    family: SANS,
    weight: 600,
    field: 'sheet_title',
  });
  rule(t.y + t.height);

  // Sheet number, revision and "x OF y".
  const sh = L.sheet;
  label(sh, 'SHEET');
  const mid = sh.x + sh.width / 2;
  const ny = sh.y + sh.height * 0.55;
  text(mid, ny, values.sheetNumber, {
    sizePt: PT.number,
    family: SANS,
    anchor: 'middle',
    weight: 600,
    field: 'sheet_number',
  });
  text(mid, ny + line(PT.rev) * 2, values.revision, { sizePt: PT.rev, anchor: 'middle', field: 'revision' });
  text(mid, sh.y + sh.height - pad, values.sheetOf, { sizePt: PT.label, anchor: 'middle', field: 'sheet_of' });

  out.push(
    `<rect x="${num(L.column.x)}" y="${num(L.column.y)}" width="${num(L.column.width)}" height="${num(L.column.height)}" fill="none" stroke="${INK}" stroke-width="${num(HEAVY)}"/>`,
  );
  out.push('</g>');
  return out.join('');
}
