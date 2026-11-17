// EZD-5605 T21 (vault/plans/EZD-5605.md section 4; D-Buttons, D-Hint; S03c approved wording "Adjust hint" and "After
// the buttons"; board S03c line 157; Q-0639; AC-EZD-5605-1, -3): the hint after the buttons, Adjust pressed and
// disabled while adjusting, all three disabled while Accept waits; in the panel the hint shows with the buttons only.
import { describe, expect, it, vi } from 'vitest';
import { AssistantPanelView } from './AssistantPanel';
import type { OkPreview } from './apply-reply';
import type { AssistantEntry } from './assistant-ui';
import { PreviewActions, PreviewHint } from './PreviewActions';
import { disabled, els, render, text } from './preview-markup.test-helpers';

const HINT = 'Adjust: edit the preview by hand, then Accept. Accepted changes can be undone.';
const IDS = ['assistant-accept', 'assistant-adjust', 'assistant-reject'];
const noop = () => {};
const states = (html: string) => IDS.map((id) => disabled(els(html, id)[0]!.open));
const pressed = (html: string) =>
  /aria-pressed="true"/.test(els(html, 'assistant-adjust')[0]!.open);

const OK: OkPreview = {
  ok: true,
  changes: [],
  added: [],
  removed: [],
  updated: [],
  touched: [],
  provisional: {},
};
const entry: AssistantEntry = {
  kind: 'reply',
  id: 1,
  prompt: 'p',
  message: 'Here is a door.',
  model: 'sonnet',
  costMicroUsd: 20000,
  sessionMicroUsd: 20000,
};

const panel = (stale: boolean, actions?: { adjusting?: boolean; busy?: boolean }) =>
  render(
    <AssistantPanelView
      ui={{
        open: true,
        keyState: 'present',
        entries: [entry],
        draft: '',
        model: 'sonnet',
        phase: 'idle',
        profileOpen: false,
        photo: null,
        photoProblem: null,
        photoPreparing: false,
      }}
      onClose={noop}
      onDraft={noop}
      onModel={noop}
      onSend={noop}
      onOpenProfile={noop}
      onRetryKey={noop}
      onAttachPhoto={noop}
      onRemovePhoto={noop}
      preview={{
        state: { preview: OK, prompt: 'p', stale, entryId: 1, before: new Map() },
        onReject: noop,
        onStaleAction: noop,
        actions: { onAccept: noop, onAdjust: noop, ...actions },
      }}
    />,
  );

describe('EZD-5605 preview actions', () => {
  it('T21 the hint text is the approved wording', () => {
    expect(text(render(<PreviewHint />))).toBe(HINT);
  });

  it('T21 idle, adjusting and busy button states', () => {
    const onAccept = vi.fn();
    const onAdjust = vi.fn();
    const idle = render(<PreviewActions onReject={noop} onAccept={onAccept} onAdjust={onAdjust} />);
    expect(states(idle)).toEqual([false, false, false]);
    expect(pressed(idle)).toBe(false);

    const adjusting = render(
      <PreviewActions onReject={noop} onAccept={onAccept} onAdjust={onAdjust} adjusting />,
    );
    expect(states(adjusting)).toEqual([false, true, false]);
    expect(pressed(adjusting)).toBe(true);

    const busy = render(
      <PreviewActions onReject={noop} onAccept={onAccept} onAdjust={onAdjust} busy />,
    );
    expect(states(busy)).toEqual([true, true, true]);
  });

  it('T21 in the panel the hint follows the buttons; a stale preview shows neither', () => {
    const html = panel(false);
    const reply = els(html, 'assistant-reply')[0]!.inner;
    expect(reply.indexOf('assistant-preview-actions')).toBeGreaterThanOrEqual(0);
    expect(reply.indexOf('assistant-preview-actions')).toBeLessThan(
      reply.indexOf('assistant-preview-hint'),
    );
    expect(text(els(html, 'assistant-preview-hint')[0]!.outer)).toBe(HINT);
    expect(states(panel(false, { busy: true }))).toEqual([true, true, true]);
    expect(pressed(panel(false, { adjusting: true }))).toBe(true);

    const stale = panel(true);
    expect(els(stale, 'assistant-preview-hint')).toHaveLength(0);
    expect(els(stale, 'assistant-accept')).toHaveLength(0);
  });
});
