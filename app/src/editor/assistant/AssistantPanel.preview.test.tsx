// EZD-5604b P1-P3 (vault/plans/EZD-5604b.md section 4 and section 6 wording; AC-EZD-5604-1, -4, -5, -7; Q-0640 row
// 56-9). Static markup in the office MessagesProvider, as EZD-5603a's T14-T20. The stale action is checked through
// the function the panel gives the button (no DOM in the app's unit tests).
import { describe, expect, it, vi } from 'vitest';
import { AssistantPanelView, type PanelPreview } from './AssistantPanel';
import { putPromptBack } from './AssistantPanel';
import type { AssistantEntry, AssistantUi } from './assistant-ui';
import type { OkPreview } from './apply-reply';
import { createModelStore } from '../model/model-store';
import { baseObjects, uid, withWalls } from '../tools/test-utils/fixtures';
import { createPreviewStore, EMPTY_PREVIEW_STATE, type PreviewState } from './preview-store';
import { disabled, els, render, text } from './preview-markup.test-helpers';

const REFUSED =
  "The assistant's change doesn't fit the drawing. Nothing on the drawing changed. Try wording the prompt another way.";
const STALE = "The drawing changed after this preview was made, so it can't be accepted.";
const noop = () => {};

const reply = (
  id: number,
  over: Partial<Extract<AssistantEntry, { kind: 'reply' }>> = {},
): AssistantEntry => ({
  kind: 'reply',
  id,
  prompt: `prompt ${id}`,
  message: `reply ${id}`,
  model: 'sonnet',
  costMicroUsd: 20000,
  sessionMicroUsd: 20000 * id,
  ...over,
});

const OK: OkPreview = {
  ok: true,
  changes: [],
  added: [],
  removed: [],
  updated: [uid(1)],
  touched: [uid(1)],
  provisional: {},
};
const state = (o: Partial<PreviewState>): PreviewState => ({
  preview: OK,
  prompt: 'prompt 2',
  stale: false,
  entryId: 2,
  before: new Map(),
  ...o,
});

const view = (entries: AssistantEntry[], preview?: PanelPreview) =>
  render(
    <AssistantPanelView
      ui={{
        open: true,
        keyState: 'present',
        entries,
        draft: 'x',
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
      preview={preview}
    />,
  );

const prompts = (html: string) =>
  ['assistant-prompt', 'assistant-model', 'assistant-photo', 'assistant-send'].map((id) =>
    disabled(els(html, id)[0]!.open),
  );

describe('EZD-5604b AssistantPanel preview', () => {
  it('P1 the buttons only under the previewed reply; the prompt area locked while one is open', () => {
    const entries = [reply(1), reply(2)];
    const html = view(entries, { state: state({}), onReject: noop, onStaleAction: noop });
    const replies = els(html, 'assistant-reply');
    expect(els(replies[0]!.outer, 'assistant-preview-actions')).toHaveLength(0);
    expect(els(replies[1]!.outer, 'assistant-preview-actions')).toHaveLength(1);
    // between the reply text and the cost line
    const inner = replies[1]!.inner;
    expect(inner.indexOf('assistant-reply-text')).toBeLessThan(
      inner.indexOf('assistant-preview-actions'),
    );
    expect(inner.indexOf('assistant-preview-actions')).toBeLessThan(
      inner.indexOf('assistant-cost'),
    );
    expect(prompts(html)).toEqual([true, true, true, true]);

    for (const p of [
      { state: EMPTY_PREVIEW_STATE, onReject: noop, onStaleAction: noop },
      undefined,
    ]) {
      const h = view(entries, p);
      expect(els(h, 'assistant-accept')).toHaveLength(0);
      expect(prompts(h)).toEqual([false, false, false, false]);
    }
  });

  it('P2 a refused reply says so; a stale preview says so with one button and no Accept', () => {
    const refused = view([reply(1, { refused: true })]);
    const box = els(refused, 'assistant-refused')[0]!;
    expect(box.open).toContain('role="alert"');
    expect(text(box.outer)).toContain(REFUSED);
    expect(box.inner).not.toContain('<button');

    const onStaleAction = vi.fn();
    const html = view([reply(1)], {
      state: state({ entryId: 1, stale: true }),
      onReject: noop,
      onStaleAction,
    });
    const stale = els(html, 'assistant-preview-stale')[0]!;
    expect(stale.open).toContain('role="alert"');
    expect(text(stale.outer)).toContain(STALE);
    expect(text(els(stale.outer, 'assistant-stale-action')[0]!.outer)).toBe('Put the prompt back');
    expect(els(html, 'assistant-accept')).toHaveLength(0);
    expect(prompts(html)).toEqual([true, true, true, true]);
  });

  it('P3 the stale action puts the prompt back, clears the preview and sends nothing', () => {
    const before = withWalls(
      baseObjects(),
      1,
      [
        { x: 0, y: 0 },
        { x: 144, y: 0 },
      ],
      false,
    );
    const model = createModelStore({ objects: before });
    const store = createPreviewStore({ store: model });
    store.open({ preview: OK, prompt: 'add a door', entryId: 1, before });
    const wall = before.get(uid(1))!;
    model.applyEdit([{ id: uid(1), value: { ...wall } }]);
    expect(store.getState().stale).toBe(true);
    const session = { setDraft: vi.fn(), send: vi.fn() };
    putPromptBack(session, store);
    expect(session.setDraft).toHaveBeenCalledTimes(1);
    expect(session.setDraft).toHaveBeenCalledWith('add a door');
    expect(store.getState().preview).toBeNull();
    expect(session.send).not.toHaveBeenCalled();
  });
});
