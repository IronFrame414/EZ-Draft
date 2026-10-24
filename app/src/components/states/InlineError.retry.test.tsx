// EZD-015a · U17 (vault/plans/EZD-015a.md Section 4). Source: Decided InlineError markup; S01 "with Retry".
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { en } from '../../server/messages/catalogs/en';
import { InlineError } from './InlineError';

const recorded = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock('./StateButton', () => ({
  StateButton: (props: Record<string, unknown>) => {
    recorded.push(props);
    return <button type="button">{props.children as string}</button>;
  },
}));

describe('EZD-015a InlineError retry', () => {
  it('EZD-015a done when: the inline error shows its message and Retry calls the handler', () => {
    const spy = vi.fn();
    renderToStaticMarkup(
      <MessagesProvider language="en" messages={catalogFor('dev', 'en')}>
        <InlineError message="dev.messages.sample" onRetry={spy} />
      </MessagesProvider>,
    );
    expect(recorded.length).toBe(1);
    const props = recorded[0];
    expect(props.children).toBe((en as unknown as Record<string, string>)['common.retry']);
    expect(props.compact).toBe(true);
    const onClick = props.onClick as (e: unknown) => void;
    onClick({ type: 'click' });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith();
    onClick({ type: 'click' });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
