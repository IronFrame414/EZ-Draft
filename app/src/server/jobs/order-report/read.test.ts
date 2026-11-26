// EZD-916 (S12 Order report import; Decisions 2 "Lines are read by text extraction plus AI"; vault/build/assumptions.md
// EZD-916 "How lines are read", "Confidence": 95 when the line's code and width appear on one extracted text row, 60
// otherwise). Text items here are hand-placed page items (pdf.js centres, y up); expected rows and confidences follow
// from those rules. The Claude call runs against the built-in stub (AI_MODE stub, recordings/order-report.ts).
import { afterEach, describe, expect, it } from 'vitest';
import { clearStubRecordings, lastStubRequests, setStubRecording } from '../../ai/test-harness/stub';
import { orderReportRecording } from '../../ai/test-harness/recordings/order-report';
import type { PdfPageRead, PdfText } from '../pdf-walls/read-pdf';
import {
  ORDER_LINE_CONFIDENT,
  ORDER_LINE_UNSURE,
  ORDER_REPORT_READ_PURPOSE,
  orderLineConfidence,
  orderLineItems,
  orderReportReplySchema,
  orderReportRows,
  readOrderReport,
} from './read';

const text = (str: string, x: number, y: number): PdfText => ({ str, at: [x, y], height: 9 });
const page = (texts: PdfText[]): PdfPageRead => ({ texts }) as unknown as PdfPageRead;

const REPORT = page([
  text('ORDER REPORT', 80, 754),
  text('CODE', 110, 704),
  text('LINE', 60, 704),
  text('7', 58, 684),
  text('SB36', 110, 684.5),
  text('36"', 175, 683.8),
  text('FD + 2 doors', 260, 684),
  text('Shaker, White', 420, 684),
  text('9', 58, 664),
  text('B18', 110, 664),
  text('18"', 175, 664),
]);

const ctx = {
  job: { id: 'job-1', tenant_id: 't', project_id: 'p', kind: 'import' },
  signal: new AbortController().signal,
  timeLeft: () => 60_000,
  sleep: async () => {},
} as never;

afterEach(() => clearStubRecordings());

describe('EZD-916 order report text rows', () => {
  it('groups items on one baseline into a row, top to bottom, cells left to right', () => {
    expect(orderReportRows([REPORT])).toEqual([
      ['ORDER REPORT'],
      ['LINE', 'CODE'],
      ['7', 'SB36', '36"', 'FD + 2 doors', 'Shaker, White'],
      ['9', 'B18', '18"'],
    ]);
  });

  it('a page with no text gives no rows', () => {
    expect(orderReportRows([page([])])).toEqual([]);
  });
});

describe('EZD-916 order line confidence', () => {
  const rows = orderReportRows([REPORT]);
  it('95 when the code and the width are cells of one row', () => {
    expect(orderLineConfidence({ code: 'SB36', width: 36 }, rows)).toBe(ORDER_LINE_CONFIDENT);
    expect(ORDER_LINE_CONFIDENT).toBe(95);
  });
  it('60 when the width is on another row, the code is not printed, or there is no width', () => {
    expect(orderLineConfidence({ code: 'SB36', width: 18 }, rows)).toBe(ORDER_LINE_UNSURE);
    expect(orderLineConfidence({ code: 'B24', width: 24 }, rows)).toBe(60);
    expect(orderLineConfidence({ code: 'B18', width: null }, rows)).toBe(60);
  });
});

describe('EZD-916 order line items', () => {
  const rows = orderReportRows([REPORT]);
  it('keeps report order, numbers the items and drops lines without a line number or code', () => {
    const items = orderLineItems(
      orderReportReplySchema.parse({
        lines: [
          { lineNo: 7, code: 'SB36', width: 36, face: 'FD + 2 doors', finish: 'Shaker, White' },
          { lineNo: '#9', code: ' B18 ', width: '18"', face: null, finish: '' },
          { lineNo: 7, code: 'B99', width: 1, face: null, finish: null },
          { lineNo: 0, code: 'X', width: 1, face: null, finish: null },
          { lineNo: 11, code: '', width: 1, face: null, finish: null },
          { lineNo: 12, code: 'W3030', width: 'thirty', face: null, finish: null },
        ],
      }),
      rows,
    );
    expect(items).toEqual([
      {
        id: 'ol7',
        type: 'order_line',
        number: 1,
        confidence: 95,
        lineNo: 7,
        code: 'SB36',
        width: 36,
        face: 'FD + 2 doors',
        finish: 'Shaker, White',
      },
      { id: 'ol9', type: 'order_line', number: 2, confidence: 95, lineNo: 9, code: 'B18', width: 18, face: null, finish: null },
      { id: 'ol12', type: 'order_line', number: 3, confidence: 60, lineNo: 12, code: 'W3030', width: null, face: null, finish: null },
    ]);
  });
});

describe('EZD-916 readOrderReport', () => {
  it('sends the text rows to Claude once and answers its lines', async () => {
    setStubRecording(
      'anthropic',
      ORDER_REPORT_READ_PURPOSE,
      orderReportRecording({ lines: [{ lineNo: 9, code: 'B18', width: 18, face: '1 door + 1 drawer', finish: 'Shaker, White' }] }),
    );
    const items = await readOrderReport(ctx, [REPORT]);
    expect(items.map((i) => [i.lineNo, i.code, i.width, i.confidence])).toEqual([[9, 'B18', 18, 95]]);
    const sent = lastStubRequests('anthropic');
    expect(sent).toHaveLength(1);
    const body = JSON.parse(sent[0].bodyText ?? '{}') as { messages: { content: { text: string }[] }[] };
    expect(body.messages[0].content[1].text).toBe(
      'ORDER REPORT\nLINE | CODE\n7 | SB36 | 36" | FD + 2 doors | Shaker, White\n9 | B18 | 18"',
    );
  });

  it('a report with no text makes no call and gives no lines', async () => {
    expect(await readOrderReport(ctx, [page([])])).toEqual([]);
    expect(lastStubRequests('anthropic')).toHaveLength(0);
  });
});
