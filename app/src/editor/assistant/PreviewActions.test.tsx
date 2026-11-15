// EZD-5604b A1 (vault/plans/EZD-5604b.md section 4; AC-EZD-5604-7; AC-EZD-5603-10 via Q-0651 (a)): Accept, Adjust
// and Reject in that order (board S03c line 156; approved S03c wording); Accept and Adjust disabled until EZD-5605
// passes their handlers; each a touch target. Clicks are checked through the props each button is given.
import { describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import touch from '../../styles/touch.module.css';
import { PreviewActions } from './PreviewActions';
import { classes, disabled, els, render, text } from './preview-markup.test-helpers';

vi.mock('../../lib/messages', async (orig) => orig());

const IDS = ['assistant-accept', 'assistant-adjust', 'assistant-reject'];

// The buttons PreviewActions returns, read off its element tree with a stub t().
async function buttons(props: Parameters<typeof PreviewActions>[0]) {
  const messages = await import('../../lib/messages');
  const spy = vi.spyOn(messages, 'useT').mockReturnValue(((k: string) => k) as never);
  const tree = PreviewActions(props) as ReactElement<{ children: ReactElement[] }>;
  spy.mockRestore();
  return tree.props.children.filter(isValidElement) as ReactElement<{
    onClick?: () => void;
    disabled?: boolean;
  }>[];
}

describe('EZD-5604b PreviewActions', () => {
  it('A1 three buttons in order; Accept and Adjust wait for EZD-5605; each handler once', async () => {
    const onReject = vi.fn();
    const html = render(<PreviewActions onReject={onReject} />);
    const row = els(html, 'assistant-preview-actions')[0]!;
    const found = IDS.map((id) => els(row.outer, id)[0]!);
    expect(found.map((b) => text(b.outer))).toEqual(['Accept', 'Adjust', 'Reject']);
    expect(text(row.outer)).toBe('Accept Adjust Reject');
    expect(found.map((b) => disabled(b.open))).toEqual([true, true, false]);
    for (const b of found) expect(classes(b.open)).toContain(touch.target);
    const only = await buttons({ onReject });
    only[2]!.props.onClick!();
    expect(onReject).toHaveBeenCalledTimes(1);

    const onAccept = vi.fn();
    const onAdjust = vi.fn();
    const all = render(
      <PreviewActions onReject={onReject} onAccept={onAccept} onAdjust={onAdjust} />,
    );
    expect(IDS.map((id) => disabled(els(all, id)[0]!.open))).toEqual([false, false, false]);
    const three = await buttons({ onReject, onAccept, onAdjust });
    three.forEach((b) => b.props.onClick!());
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAdjust).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(2);
  });
});
