// EZD-5603a T1-T4 (vault/plans/EZD-5603a.md section 4; AC-EZD-5603-1, -4, -12, -13). Pure functions of the
// Assistant panel state. Expected values: Q-0638 gaps 7, 9, 13, 17; P5602 D-Map, D-Body; Decided "Error lines",
// "History", "Limits" of the plan.
import { describe, expect, it } from 'vitest';
import { ICON_NAMES } from '../../components/icon/icon-names.generated';
import {
  ASSISTANT_HISTORY_MAX_TURNS as SERVER_HISTORY,
  ASSISTANT_PROMPT_MAX_CHARS as SERVER_PROMPT,
  ASSISTANT_SELECTED_MAX as SERVER_SELECTED,
  ASSISTANT_TURN_MAX_CHARS as SERVER_TURN,
} from '../../server/assistant/assistant';
import {
  ASSISTANT_HISTORY_MAX_TURNS,
  ASSISTANT_PROMPT_MAX_CHARS,
  ASSISTANT_RAIL_TOOL,
  ASSISTANT_SELECTED_MAX,
  ASSISTANT_TURN_MAX_CHARS,
  assistantShown,
  canSendPrompt,
  cutTurn,
  failureFrom,
  historyFrom,
  type AssistantEntry,
  type AssistantUi,
} from './assistant-ui';

const reply = (n: number, message = `m${n}`): AssistantEntry => ({
  kind: 'reply',
  id: n,
  prompt: `p${n}`,
  message,
  model: 'sonnet',
  costMicroUsd: 20000,
  sessionMicroUsd: 20000 * n,
});

describe('EZD-5603a assistant-ui', () => {
  it('T1 history: replies only, 20 turns, cut at 2,000 units, empty replies skipped', () => {
    const entries: AssistantEntry[] = [];
    for (let n = 1; n <= 11; n++) entries.push(reply(n));
    entries.splice(4, 0, {
      kind: 'failed',
      id: 100,
      prompt: 'pf',
      messageKey: 'office.assistant.send_failed',
      profileLink: false,
      costMicroUsd: null,
      sessionMicroUsd: null,
    });
    entries.push({ kind: 'waiting', id: 101, prompt: 'pw' });
    const turns = historyFrom(entries);
    const want = [];
    for (let n = 2; n <= 11; n++) {
      want.push({ role: 'user', text: `p${n}` }, { role: 'assistant', text: `m${n}` });
    }
    expect(turns).toEqual(want);

    const long = historyFrom([reply(1, 'a'.repeat(2500))]);
    expect(long).toHaveLength(2);
    expect(long[1]!.text).toHaveLength(2000);

    expect(cutTurn('a'.repeat(1999) + '😀')).toHaveLength(1999);

    expect(historyFrom([reply(1, '')])).toEqual([]);
    expect(historyFrom([reply(1, ''), reply(2)])).toEqual([
      { role: 'user', text: 'p2' },
      { role: 'assistant', text: 'm2' },
    ]);
  });

  it('T2 failureFrom maps the server answers to a failure', () => {
    const body = (code: string, message_key: string, extra: object = {}) => ({
      error: { code, message_key },
      ...extra,
    });
    const failed = (messageKey: string, profileLink: boolean, costMicroUsd: number | null = null) => ({
      kind: 'failed',
      messageKey,
      profileLink,
      costMicroUsd,
    });
    expect(
      failureFrom(400, body('assistant_out_of_credit', 'error.assistant_out_of_credit')),
    ).toEqual(failed('error.assistant_out_of_credit', true));
    expect(failureFrom(400, body('assistant_key_refused', 'error.assistant_key_refused'))).toEqual(
      failed('error.assistant_key_refused', true),
    );
    expect(failureFrom(400, body('assistant_no_key', 'error.assistant_no_key'))).toEqual({
      kind: 'no_key',
    });
    expect(
      failureFrom(
        429,
        body('assistant_provider_rate_limited', 'error.assistant_provider_rate_limited'),
      ),
    ).toEqual(failed('error.assistant_provider_rate_limited', false));
    expect(
      failureFrom(502, body('assistant_provider_unavailable', 'error.assistant_unavailable')),
    ).toEqual(failed('error.assistant_unavailable', false));
    expect(failureFrom(504, body('assistant_timeout', 'error.assistant_unavailable'))).toEqual(
      failed('error.assistant_unavailable', false),
    );
    expect(
      failureFrom(
        502,
        body('assistant_invalid_reply', 'error.assistant_invalid_reply', { costMicroUsd: 20000 }),
      ),
    ).toEqual(failed('error.assistant_invalid_reply', false, 20000));
    expect(
      failureFrom(
        502,
        body('assistant_invalid_reply', 'error.assistant_invalid_reply', { costMicroUsd: 0 }),
      ),
    ).toEqual(failed('error.assistant_invalid_reply', false, null));
    expect(failureFrom(403, body('permission_denied', 'error.not_authorized'))).toEqual(
      failed('error.not_authorized', false),
    );
    expect(failureFrom(500, body('whatever', 'error.zzz'))).toEqual(
      failed('office.assistant.send_failed', false),
    );
    expect(failureFrom(500, 'nope')).toEqual(failed('office.assistant.send_failed', false));
  });

  it('T3 assistantShown and canSendPrompt', () => {
    expect(assistantShown({ canEdit: true, view: 'plan' })).toBe(true);
    expect(assistantShown({ canEdit: false, view: 'plan' })).toBe(false);
    expect(assistantShown({ canEdit: true, view: '3d' })).toBe(false);

    const ui = (p: Partial<AssistantUi>): AssistantUi => ({
      open: true,
      keyState: 'present',
      entries: [],
      draft: 'add a door',
      model: 'sonnet',
      phase: 'idle',
      profileOpen: false,
      photo: null,
      photoProblem: null,
      photoPreparing: false,
      ...p,
    });
    expect(canSendPrompt(ui({ draft: '' }))).toBe(false);
    expect(canSendPrompt(ui({ draft: '   ' }))).toBe(false);
    expect(canSendPrompt(ui({ draft: 'a'.repeat(8000) }))).toBe(true);
    expect(canSendPrompt(ui({ draft: 'a'.repeat(8001) }))).toBe(false);
    for (const keyState of ['none', 'loading', 'failed'] as const) {
      expect(canSendPrompt(ui({ keyState }))).toBe(false);
    }
    for (const phase of ['draining', 'waiting'] as const) {
      expect(canSendPrompt(ui({ phase }))).toBe(false);
    }
  });

  it('T4 constants equal the server constants; the rail tool has no shortcut and a known icon', () => {
    expect(ASSISTANT_PROMPT_MAX_CHARS).toBe(SERVER_PROMPT);
    expect(ASSISTANT_HISTORY_MAX_TURNS).toBe(SERVER_HISTORY);
    expect(ASSISTANT_TURN_MAX_CHARS).toBe(SERVER_TURN);
    expect(ASSISTANT_SELECTED_MAX).toBe(SERVER_SELECTED);
    expect(ASSISTANT_RAIL_TOOL).toEqual({
      kind: 'tool',
      id: 'assistant',
      icon: 'auto_awesome',
      label: 'office.tool.assistant',
    });
    expect('shortcut' in ASSISTANT_RAIL_TOOL).toBe(false);
    expect(ICON_NAMES as readonly string[]).toContain(ASSISTANT_RAIL_TOOL.icon);
  });
});
