// EZD-1963 (AC-EZD-1963-1; cause: e2e/field-measure-entry.spec.ts AC-EZD-1419-2 tapped Menu on the server's HTML,
// before the screen's scripts had loaded, so the menu never opened and Reopen never showed). The menu button is
// disabled in the server's HTML; it is enabled once the screen runs on the phone, which the e2e spec covers (static
// markup here, as the other component tests: no DOM environment). Every other control keeps its server state.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateHost } from '../components/states/StateHost';
import { MessagesProvider } from '../lib/messages';
import { catalogFor } from '../server/messages/catalog';
import { FieldMeasureScreen } from './FieldMeasureScreen';
import { initialRooms, withShape, type FieldRoom } from './rooms';

function render(sentAt: string | null, language: 'en' | 'es' = 'en'): string {
  return renderToStaticMarkup(
    <MessagesProvider language={language} messages={catalogFor('field', language)}>
      <StateHost>
        <FieldMeasureScreen
          projectId="00000000-0000-4000-8000-000000000001"
          projectName="Hendricks residence"
          initialRooms={[withShape(initialRooms()[0] as FieldRoom, 'rectangle')]}
          canEdit
          canReopen
          sentAt={sentAt}
        />
      </StateHost>
    </MessagesProvider>,
  );
}

const menuButton = (html: string) => /<button[^>]*aria-haspopup="menu"[^>]*>/.exec(html)?.[0] ?? '';

describe('EZD-1963 Field measure menu before the screen runs on the phone', () => {
  it("the menu button is disabled in the server's HTML, sent or not", () => {
    for (const sentAt of [null, '2026-11-22T15:00:00.000Z']) {
      const button = menuButton(render(sentAt));
      expect(button).toContain('aria-label="Menu"');
      expect(button).toMatch(/\sdisabled=""/);
      expect(button).toContain('aria-expanded="false"');
    }
  });

  it("the menu is closed in the server's HTML: no Send to office, no Reopen", () => {
    const html = render('2026-11-22T15:00:00.000Z');
    expect(html).not.toContain('role="menu"');
    expect(html).not.toContain('measure-reopen');
  });

  it('an open room keeps its shape buttons enabled', () => {
    const shapes = render(null).match(/<button[^>]*data-shape[^>]*>/g) ?? [];
    expect(shapes).toHaveLength(5);
    expect(shapes.some((b) => b.includes('disabled'))).toBe(false);
  });
});
