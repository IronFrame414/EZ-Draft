// EZD-916 (S12 Order report import "Reads codes, sizes, finishes and order line numbers; lines become the reference
// for tags"; Decisions 2 "Order report accepted as PDF ... Lines are read by text extraction plus AI and shown in
// Import review for the user to confirm"; Data shown "Order report lines: line no, code, width, face, finish";
// vault/build/assumptions.md EZD-916 "How lines are read", "Confidence"): the order report read of the import job.
// pdf.js gives each page's text items (pdf-walls/read-pdf); the items on one baseline make a text row, its cells left
// to right. The rows go to Claude in one call (purpose supplier.order_report_read), which answers the lines. A line
// is 95% confident when its code and its width both appear as cells of one text row, else 60%. Lines are kept in
// report order; a repeated line number keeps its first line. A report with no text (a scan) gives no lines and
// makes no call. The AI runs in the job only (architecture AI, EZD-021).
import { z } from 'zod';
import type { ReviewOrderLine } from '../../../lib/imports/review';
import { callClaudeJson, type AiJobContext } from '../../ai';
import { ORDER_REPORT_READ_PURPOSE } from '../../ai/test-harness/recordings/order-report';
import type { PdfPageRead } from '../pdf-walls/read-pdf';

export { ORDER_REPORT_READ_PURPOSE };

/** Confidence (%) of a line whose code and width are cells of one text row, and of any other line. */
export const ORDER_LINE_CONFIDENT = 95;
export const ORDER_LINE_UNSURE = 60;

/** The most lines one report gives, and the most text sent to Claude (characters). */
export const ORDER_LINES_MAX = 500;
export const ORDER_REPORT_TEXT_MAX = 60_000;

/** order_line column limits (supabase/migrations/…_order_line.sql). */
const CODE_MAX = 64;
const TEXT_MAX = 200;

/**
 * Text rows of a report: per page, top to bottom, the items whose centres are within half a text height of each
 * other in y share a row; each row's cells run left to right.
 */
export function orderReportRows(pages: readonly PdfPageRead[]): string[][] {
  const rows: string[][] = [];
  for (const page of pages) {
    const items = page.texts
      .map((t) => ({ str: t.str.trim(), x: t.at[0], y: t.at[1], h: t.height }))
      .filter((t) => t.str !== '')
      .sort((a, b) => b.y - a.y || a.x - b.x);
    let current: typeof items = [];
    const flush = () => {
      if (current.length > 0) rows.push(current.sort((a, b) => a.x - b.x).map((t) => t.str));
      current = [];
    };
    for (const t of items) {
      const first = current[0];
      if (first && Math.abs(first.y - t.y) > Math.max(first.h, t.h, 1) / 2) flush();
      current.push(t);
    }
    flush();
  }
  return rows;
}

/** The rows as Claude reads them: one row per line, cells separated by " | ". */
export function rowsText(rows: readonly string[][]): string {
  return rows
    .map((r) => r.join(' | '))
    .join('\n')
    .slice(0, ORDER_REPORT_TEXT_MAX);
}

const widthCell = (cell: string, width: number): boolean => {
  const n = Number(cell.replace(/(["”]|in\.?)$/i, '').trim());
  return cell.trim() !== '' && Number.isFinite(n) && n === width;
};

/** 95 when one row holds the line's code as a cell and its width as a cell (with or without the inch mark). */
export function orderLineConfidence(
  line: { code: string; width: number | null },
  rows: readonly string[][],
): number {
  if (line.width === null) return ORDER_LINE_UNSURE;
  const width = line.width;
  const found = rows.some((r) => r.includes(line.code) && r.some((c) => widthCell(c, width)));
  return found ? ORDER_LINE_CONFIDENT : ORDER_LINE_UNSURE;
}

const looseText = (max: number) =>
  z
    .string()
    .nullable()
    .optional()
    .transform((s) => {
      const t = (s ?? '').trim();
      return t === '' || t.length > max ? null : t;
    });

/** Claude's reply: the lines it read. A line without a whole positive number or a usable code is dropped. */
export const orderReportReplySchema = z.object({
  lines: z
    .array(
      z.object({
        lineNo: z.unknown(),
        code: z.unknown(),
        width: z.unknown(),
        face: looseText(TEXT_MAX),
        finish: looseText(TEXT_MAX),
      }),
    )
    .max(ORDER_LINES_MAX * 2),
});

export type OrderReportReply = z.infer<typeof orderReportReplySchema>;

export const ORDER_REPORT_PROMPT = [
  'You read a kitchen cabinet supplier order report (from 2020 Design) for a remodeling contractor.',
  'The text below is the report, one text row per line, cells separated by " | ".',
  'List every ordered item line: its line number, the cabinet or part code exactly as printed, its width in inches',
  'as a number, the door and drawer face (for example "FD + 2 doors") and the finish (door style and color).',
  'Use null for a value the line does not show. Skip headings and totals. Answer with JSON only:',
  '{"lines":[{"lineNo":7,"code":"SB36","width":36,"face":"FD + 2 doors","finish":"Shaker, White"}]}',
].join('\n');

const lineNoOf = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/^#/, '').trim()) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : null;
};

const widthOf = (v: unknown): number | null => {
  const n =
    typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/(["”]|in\.?)$/i, '').trim()) : NaN;
  return Number.isFinite(n) && n > 0 && n < 1000 ? n : null;
};

const codeOf = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const c = v.trim();
  return c === '' || c.length > CODE_MAX ? null : c;
};

/** Claude's lines as Import review items, with their confidence from the text rows (pure). */
export function orderLineItems(reply: OrderReportReply, rows: readonly string[][]): ReviewOrderLine[] {
  const seen = new Set<number>();
  const items: ReviewOrderLine[] = [];
  for (const raw of reply.lines) {
    const lineNo = lineNoOf(raw.lineNo);
    const code = codeOf(raw.code);
    if (lineNo === null || code === null || seen.has(lineNo)) continue;
    if (items.length >= ORDER_LINES_MAX) break;
    seen.add(lineNo);
    const width = widthOf(raw.width);
    items.push({
      id: `ol${lineNo}`,
      type: 'order_line',
      number: items.length + 1,
      confidence: orderLineConfidence({ code, width }, rows),
      lineNo,
      code,
      width,
      face: raw.face ?? null,
      finish: raw.finish ?? null,
    });
  }
  return items;
}

/** Reads an order report's lines: text rows from pdf.js, then one Claude call. No text: no lines, no call. */
export async function readOrderReport(
  ctx: AiJobContext,
  pages: readonly PdfPageRead[],
): Promise<ReviewOrderLine[]> {
  const rows = orderReportRows(pages);
  if (rows.length === 0) return [];
  const { data } = await callClaudeJson(
    ctx,
    {
      purpose: ORDER_REPORT_READ_PURPOSE,
      model: 'sonnet',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: ORDER_REPORT_PROMPT },
            { type: 'text', text: rowsText(rows) },
          ],
        },
      ],
      maxTokens: 16000,
    },
    orderReportReplySchema,
  );
  return orderLineItems(data, rows);
}
