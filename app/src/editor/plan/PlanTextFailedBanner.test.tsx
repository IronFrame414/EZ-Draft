// EZD-376 C1, C2 (vault/plans/EZD-376.md section 4; section 6 wording; AC-EZD-376-1, -2). Rendered in the real office
// catalog, English; a stub controller.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { en } from '../../server/messages/catalogs/en';
import { es } from '../../server/messages/catalogs/es';
import { elements, textOf } from '../../../test-harness/projects-markup';
import { PlanTextFailedBanner } from './PlanTextFailedBanner';

const TEXT =
  "Couldn't show the room names and measurements on the plan. Reload the page to try again.";

const render = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {ui}
    </MessagesProvider>,
  );
const count = (s: string, needle: string) => s.split(needle).length - 1;
const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

const stub = (failed: boolean) => ({
  atlasFailed: () => failed,
  subscribeAtlasFailed: () => () => {},
});

describe('EZD-376 plan text failed banner', () => {
  it('EZD-376 C1 the banner is empty until the atlas fails, then one error alert with the message and no button', () => {
    // An empty render is the MessagesProvider wrapper alone.
    const empty = render(<></>);
    expect(render(<PlanTextFailedBanner controller={stub(false)} />)).toBe(empty);

    const html = render(<PlanTextFailedBanner controller={stub(true)} />);
    const banner = elements(html, 'plan-text-failed-banner');
    expect(banner).toHaveLength(1);
    const inner = banner[0]!.inner;
    expect(inner).toContain('role="alert"');
    expect(inner).toContain('data-state="error"');
    expect(inner).toContain('<use href="#ez-icon-error"');
    expect(count(inner, '<button')).toBe(0);
    expect(decode(textOf(inner))).toBe(TEXT);
  });

  it('EZD-376 C2 the message is English only', () => {
    expect(en['office.plan.text_failed']).toBe(TEXT);
    expect(Object.keys(es)).not.toContain('office.plan.text_failed');
  });
});
