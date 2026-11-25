// EZD-1417 (S17b Header "Saved on phone status"; Send to office in the menu; States "sent"). Static markup, as the
// other component tests (no DOM environment); queueing offline and sending on reconnect are covered by
// e2e/field-measure-send.spec.ts. Expected text: "Send to office" (S17b Controls) and the status wording listed in
// vault/build/assumptions.md EZD-1417.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesProvider } from '../lib/messages';
import { catalogFor } from '../server/messages/catalog';
import { StateHost } from '../components/states/StateHost';
import { FieldMeasureScreen } from './FieldMeasureScreen';
import { emptyRoom, initialRooms, withShape, type FieldRoom } from './rooms';

const ROOMS: FieldRoom[] = [
  initialRooms()[0]!,
  { ...withShape(emptyRoom('r1', 'room', 'Kitchen'), 'rectangle'), lengths: [144, 120, 144, 120] },
];

function render(sentAt: string | null, language: 'en' | 'es' = 'en'): string {
  return renderToStaticMarkup(
    <MessagesProvider language={language} messages={catalogFor('field', language)}>
      <StateHost>
        <FieldMeasureScreen
          projectId="00000000-0000-4000-8000-000000000001"
          projectName="Hendricks residence"
          initialRooms={ROOMS}
          canEdit
          sentAt={sentAt}
        />
      </StateHost>
    </MessagesProvider>,
  );
}

describe('EZD-1417 Saved on phone and Send to office', () => {
  it('while measuring: the menu button, no sent status, the keypad', () => {
    const html = render(null);
    expect(html).toMatch(/aria-label="Menu"[^>]*aria-expanded="false"/);
    expect(html).not.toContain('data-testid="measure-status"');
    expect(html).toContain('data-testid="keypad"');
  });

  it('sent rooms show Sent to office and no longer change on the phone', () => {
    const html = render('2026-11-21T15:00:00.000Z');
    expect(html).toMatch(
      /data-testid="measure-status"[^>]*data-status="sent"[^>]*>.*Sent to office</,
    );
    expect(html).not.toContain('data-testid="keypad"');
    expect(html).not.toContain('data-add-room');
    expect(html.match(/<button[^>]*data-shape[^>]*>/g)?.every((b) => b.includes('disabled'))).toBe(
      true,
    );
  });

  it('Spanish', () => {
    expect(render('2026-11-21T15:00:00.000Z', 'es')).toContain('Enviado a la oficina');
  });
});
