// EZD-916 (EZD-021 Step 3 "a later ticket adds its own entries"; CLAUDE.md rule 5; vault/build/assumptions.md EZD-916
// "Fixture and stub"): the purpose name of the order report read and its built-in stub reply, one POST /v1/messages
// exchange. This module imports no AI code, so the recordings (loaded by the AI client) can name the purpose.
// Synthetic test data: the 22 lines of fixtures/synthetic/order-report.pdf (scripts/fixtures/generate-order-report.mjs).
import type { Recording } from '../recorded-fetch';

export const ORDER_REPORT_READ_PURPOSE = 'supplier.order_report_read';

const W = 'Shaker, White';
const line = (lineNo: number, code: string, width: number, face: string | null) => ({
  lineNo,
  code,
  width,
  face,
  finish: W,
});

/** The stub reply's lines: the fixture report as Claude would read it. */
export const ORDER_REPORT_STUB_LINES = [
  line(1, 'B15', 15, '1 door + 1 drawer'),
  line(2, 'B24', 24, '2 doors + 1 drawer'),
  line(3, 'DB18', 18, '3 drawers'),
  line(4, 'B21', 21, '1 door + 1 drawer'),
  line(5, 'B30', 30, '2 doors + 1 drawer'),
  line(6, 'B12', 12, '1 door + 1 drawer'),
  line(7, 'SB36', 36, 'FD + 2 doors'),
  line(8, 'B27', 27, '2 doors + 1 drawer'),
  line(9, 'B18', 18, '1 door + 1 drawer'),
  line(10, 'F3', 3, null),
  line(11, 'W3030', 30, '2 doors'),
  line(12, 'W1830', 18, '1 door'),
  line(13, 'W2430', 24, '2 doors'),
  line(14, 'W1530', 15, '1 door'),
  line(15, 'W3630', 36, '2 doors'),
  line(16, 'W3012', 30, '2 doors'),
  line(17, 'W2130', 21, '1 door'),
  line(18, 'W2730', 27, '2 doors'),
  line(19, 'F3', 3, null),
  line(20, 'BEP24', 24, null),
  line(21, 'TK96', 96, null),
  line(22, 'CM96', 96, null),
];

export const orderReportRecording = (reply: unknown = { lines: ORDER_REPORT_STUB_LINES }): Recording => ({
  provider: 'anthropic',
  purpose: ORDER_REPORT_READ_PURPOSE,
  source: 'synthetic',
  exchanges: [
    {
      match: { method: 'POST', url: 'https://api.anthropic.com/v1/messages' },
      response: {
        status: 200,
        headers: { 'request-id': 'req_stub_order_report_read' },
        json: {
          id: 'msg_stub_order_report_read',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-5-5',
          content: [{ type: 'text', text: JSON.stringify(reply) }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1500, output_tokens: 900 },
        },
      },
    },
  ],
});

export const orderReportRecordings: Record<string, Recording> = {
  [`anthropic/${ORDER_REPORT_READ_PURPOSE}`]: orderReportRecording(),
};
