// EZD-5601 T20 (vault/plans/EZD-5601.md section 1 "D-View", section 3 data-testid rows, section 6 wording;
// AC-EZD-5601-8). Static markup of the pure AiKeyView inside the office MessagesProvider (its wrapper adds a
// leading <div lang="en"> and is not part of any position check, L-020). Attribute order is not assumed.
// Expected texts: section 6 (board S01g wording).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import { AiKeyView } from './AiKeySection';

const noop = () => {};
type View = Parameters<typeof AiKeyView>[0];
const render = (props: Partial<View>): string =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <AiKeyView
        last4={null}
        value=""
        busy={false}
        online
        messageKey={null}
        onChange={noop}
        onAdd={noop}
        onRemove={noop}
        {...props}
      />
    </MessagesProvider>,
  ).replaceAll('&#x27;', "'");

const tagsWith = (html: string, testId: string): string[] =>
  (html.match(/<[a-z][^>]*>/g) ?? []).filter((t) => t.includes(`data-testid="${testId}"`));
const classesOf = (tag: string): string[] => (/\bclass="([^"]*)"/.exec(tag)?.[1] ?? '').split(' ');
const textOf = (html: string, testId: string): string | undefined =>
  new RegExp(`data-testid="${testId}"[^>]*>([^<]*)<`).exec(html)?.[1];

describe('EZD-5601 AiKeyView markup', () => {
  it('T20 no key: heading, label, placeholder, Add, and the help with its link', () => {
    const html = render({ last4: null });
    expect(tagsWith(html, 'profile-ai-section')).toHaveLength(1);
    expect(textOf(html, 'profile-ai-heading')).toBe('AI assistant');
    expect(html).toContain('>Anthropic API key<');
    expect(html).toContain('placeholder="sk-ant-…"');
    expect(tagsWith(html, 'profile-ai-key-input')).toHaveLength(1);
    expect(html).toContain('type="password"');
    expect(textOf(html, 'profile-ai-key-add')).toBe('Add');
    expect(tagsWith(html, 'profile-ai-key-saved')).toHaveLength(0);
    expect(tagsWith(html, 'profile-ai-key-remove')).toHaveLength(0);

    expect(html).toContain('Get a key at');
    expect(html).toContain(
      '. Anthropic bills you directly; EZ Draft never charges for the assistant.',
    );
    const [link] = tagsWith(html, 'profile-ai-key-link');
    expect(link).toContain('href="https://console.anthropic.com"');
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener noreferrer"');
    expect(textOf(html, 'profile-ai-key-link')).toBe('console.anthropic.com');

    expect(classesOf(tagsWith(html, 'profile-ai-key-add')[0])).toContain(touch.target);
    expect(classesOf(link)).toContain(touch.hitArea);
    expect(tagsWith(html, 'profile-ai-key-message')).toHaveLength(0);
  });

  it('T20 a saved key: "Key saved · ends in", its last four, Remove and the saved help; no input', () => {
    const html = render({ last4: '7Qx2' });
    expect(html).toContain('Key saved · ends in');
    expect(textOf(html, 'profile-ai-key-last4')).toBe('7Qx2');
    expect(textOf(html, 'profile-ai-key-remove')).toBe('Remove');
    expect(html).toContain(
      'Anthropic bills you directly for each prompt. The key is never shown again.',
    );
    expect(tagsWith(html, 'profile-ai-key-input')).toHaveLength(0);
    expect(tagsWith(html, 'profile-ai-key-add')).toHaveLength(0);
    expect(classesOf(tagsWith(html, 'profile-ai-key-remove')[0])).toContain(touch.target);
  });

  it('T20 a message key shows its text as an alert', () => {
    const html = render({ last4: null, messageKey: 'error.ai_key_refused' });
    const [tag] = tagsWith(html, 'profile-ai-key-message');
    expect(tag).toContain('role="alert"');
    expect(textOf(html, 'profile-ai-key-message')).toBe(
      "Anthropic didn't accept this key. Nothing was saved. Check the key and paste it again.",
    );
  });
});
