// EZD-108 T9 (vault/plans/EZD-108.md section 3 data-testid and attribute rows, Decided "Settings header
// markup"; AC-EZD-108-1): the closed avatar menu. Expected values: board 01d (aria-label "Account menu",
// initials in the trigger), the plan's `data-settings-avatar` span. The wrapper is named exactly
// (MessagesProvider language="en", L-020); each element is matched on its own tag.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  usePathname: () => '/settings/company',
  useRouter: () => ({ push() {}, replace() {}, refresh() {} }),
}));

import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { AvatarMenu } from './AvatarMenu';

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('EZD-108 avatar menu markup', () => {
  it('T9 closed: one trigger button labelled Account menu holding the initials span; no menu content', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
        <AvatarMenu
          initials="JB"
          name="Josh Bishop"
          email="josh@example.test"
          showCompanySettings
        />
      </MessagesProvider>,
    );
    const button = /<button\b[^>]*>([\s\S]*?)<\/button>/.exec(html);
    expect(button).not.toBeNull();
    expect(count(html, '<button')).toBe(1);
    expect(button?.[0]).toContain('data-testid="avatar-menu-trigger"');
    expect(button?.[0]).toContain('aria-label="Account menu"');
    const span = /<span\b[^>]*\bdata-settings-avatar[^>]*>([\s\S]*?)<\/span>/.exec(
      button?.[1] ?? '',
    );
    expect(span?.[1]).toBe('JB');
    expect(html).not.toContain('data-testid="avatar-menu"');
    expect(html).not.toContain('data-testid="my-profile-dialog"');
  });
});
