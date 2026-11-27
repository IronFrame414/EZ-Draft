// EZD-2013 (AC-EZD-2013-1; flaky-test audit 2026-11-27 row 6): in every key state the prompt box shows the typed
// draft, and Send is on only with a present key. Static markup, as the EZD-5603a panel tests.
import { describe, expect, it } from 'vitest';
import { AssistantPanelView } from './AssistantPanel';
import type { AssistantUi } from './assistant-ui';
import { disabled, els, render, text } from './preview-markup.test-helpers';

const noop = () => {};
const view = (keyState: AssistantUi['keyState']) =>
  render(
    <AssistantPanelView
      ui={{
        open: true,
        keyState,
        entries: [],
        draft: 'add a door',
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
    />,
  );

describe('EZD-2013 the panel keeps the typed draft in every key state', () => {
  it.each([
    ['loading', false],
    ['present', true],
    ['failed', false],
    ['none', false],
  ] as const)('P1 key %s: the box holds the draft; Send on is %s', (keyState, sendOn) => {
    const html = view(keyState);
    expect(text(els(html, 'assistant-prompt')[0]!.inner)).toBe('add a door');
    expect(disabled(els(html, 'assistant-send')[0]!.open)).toBe(!sendOn);
  });
});
