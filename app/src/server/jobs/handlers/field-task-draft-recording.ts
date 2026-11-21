// EZD-1408 (EZD-021 Step 3 "a later ticket adds its own entries"): the built-in stub reply for the field task draft,
// one POST /v1/messages exchange. Synthetic test data, not product wording: one room (r1) with a task in each phase
// of the default sequence (S15h: demo → rough-in → inspection → drywall → finish), two in Rough-in.
import type { Recording } from '../../ai/test-harness/recorded-fetch';
import { FIELD_TASK_DRAFT_PURPOSE } from './field-task-draft-purpose';

export const DRAFT_STUB_TASKS = [
  { room: 'r1', phase: 'Demo', text: 'Remove the base cabinets and countertop' },
  { room: 'r1', phase: 'Rough-in', text: 'Move the sink drain to the new island' },
  { room: 'r1', phase: 'Rough-in', text: 'Run a 20 A circuit for the dishwasher' },
  {
    room: 'r1',
    phase: 'Inspection',
    text: 'Call for the rough plumbing and electrical inspection',
  },
  { room: 'r1', phase: 'Drywall', text: 'Hang and finish drywall on the new wall' },
  { room: 'r1', phase: 'Finish', text: 'Set the new cabinets and countertop' },
] as const;

export const fieldTaskDraftRecording = (
  tasks: readonly unknown[] = DRAFT_STUB_TASKS,
): Recording => ({
  provider: 'anthropic',
  purpose: FIELD_TASK_DRAFT_PURPOSE,
  source: 'synthetic',
  exchanges: [
    {
      match: { method: 'POST', url: 'https://api.anthropic.com/v1/messages' },
      response: {
        status: 200,
        headers: { 'request-id': 'req_stub_field_task_draft' },
        json: {
          id: 'msg_stub_field_task_draft',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-5-5',
          content: [{ type: 'text', text: JSON.stringify({ tasks }) }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 900, output_tokens: 300 },
        },
      },
    },
  ],
});

export const fieldTaskRecordings: Record<string, Recording> = {
  [`anthropic/${FIELD_TASK_DRAFT_PURPOSE}`]: fieldTaskDraftRecording(),
};
