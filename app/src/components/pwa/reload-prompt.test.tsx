// EZD-134 (03b Architecture rule 12 "finishes draining its outbox and is then told to reload"; AC-EZD-134-3):
// the prompt is due only when the page is outdated and none of this person's edits are queued (a count that
// cannot be read is not empty). Wording: vault/build/assumptions.md EZD-134.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { ReloadPromptView, reloadDue } from './ReloadPrompt';

describe('EZD-134 reload prompt', () => {
  it('due only when outdated and the outbox is empty', () => {
    expect(reloadDue(false, true, 0)).toBe(false);
    expect(reloadDue(true, true, 2)).toBe(false);
    expect(reloadDue(true, true, null)).toBe(false);
    expect(reloadDue(true, true, 0)).toBe(true);
    // Signed out: nothing of this person can be queued.
    expect(reloadDue(true, false, null)).toBe(true);
  });

  it('says the app was updated and offers Reload', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
        <ReloadPromptView onReload={() => {}} />
      </MessagesProvider>,
    );
    expect(html).toContain('data-testid="app-reload-prompt"');
    expect(html).toContain('EZ Draft has been updated. Reload to use the new version.');
    expect(html).toMatch(/data-testid="app-reload"[^>]*>Reload</);
  });
});
