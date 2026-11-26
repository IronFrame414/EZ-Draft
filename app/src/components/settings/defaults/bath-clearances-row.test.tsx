// EZD-228 (09d:34 "The bath clearance values that Round 3 put in Defaults now start at these code minimums"): the
// Bath clearances row reads the code minimums instead of Not set, and still has no editor (Q-0710: the editor waits
// for Josh's values). Rendered as defaults-form.test.tsx does.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  usePathname: () => '/settings/defaults',
  useRouter: () => ({ push() {}, replace() {}, refresh: vi.fn() }),
}));

import { MessagesProvider } from '../../../lib/messages';
import { catalogFor } from '../../../server/messages/catalog';
import { StateHost } from '../../states/StateHost';
import { UnsavedChangesProvider } from '../unsaved-changes';
import { DefaultsPage } from './DefaultsForm';

const render = (el: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <StateHost>
        <UnsavedChangesProvider draftScope="m1">{el}</UnsavedChangesProvider>
      </StateHost>
    </MessagesProvider>,
  );

describe('EZD-228 Bath clearances row', () => {
  it('reads "Code minimums", not Not set, with no input', () => {
    const html = render(<DefaultsPage initial={{}} />);
    expect(html).toMatch(/data-testid="defaults-value-bath_clearances"[^>]*>Code minimums</);
    expect(html).not.toContain('data-testid="defaults-not-set-bath_clearances"');
    expect(html).not.toContain('data-testid="defaults-input-bath_clearances"');
  });
});
