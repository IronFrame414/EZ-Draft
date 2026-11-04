// EZD-112 T10 (vault/plans/EZD-112.md section 4; AC-EZD-112-1, -8). Expected values: Decided "Shell
// additions": `subtitle` renders `p.mainSubtitle` after the `h1` inside `div.mainHead`; `flush` puts the
// children in `div.mainFlush` instead of `div.mainBody`. Positions anchor on each element's own tag (L-020).
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { StateHost } from '../states/StateHost';
import { SettingsMain } from './SettingsShell';
import styles from './SettingsShell.module.css';

const render = (el: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <StateHost>{el}</StateHost>
    </MessagesProvider>,
  );

describe('EZD-112 SettingsMain subtitle and flush', () => {
  it('T10 subtitle follows the h1 in mainHead; flush body is mainFlush, not mainBody', () => {
    const html = render(
      <SettingsMain
        section="company"
        title="office.settings.section.company"
        subtitle="office.company.subtitle"
        flush
      >
        <i data-probe="" />
      </SettingsMain>,
    );
    const head = new RegExp(
      `<div class="${styles.mainHead}"><h1 [^>]*>Company</h1><p class="${styles.mainSubtitle}">` +
        `Identity used on the title block, client pages, selections PDF and email\\.</p></div>`,
    );
    expect(html).toMatch(head);
    const flush = new RegExp(`<div class="${styles.mainFlush}"><i data-probe=""></i></div>`);
    expect(html).toMatch(flush);
    expect(html).not.toContain(`class="${styles.mainBody}"`);
  });
});
