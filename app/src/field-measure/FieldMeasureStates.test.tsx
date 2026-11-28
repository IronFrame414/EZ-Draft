// EZD-1419 (S17b States "empty room (pick a shape); measuring; closed; off by X; offline (saved on phone); sent
// (read-only until reopened by office)"; AC-EZD-1419-2 "a sent room is read-only on the phone"). Static markup, as
// the other component tests; the sent and reopen taps are covered by e2e/field-measure-entry.spec.ts. Expected
// values: the board's L-shaped Family room (S17bFieldMeasure) closes with A 218", B 108.5", C 124.5", D 87",
// F 195.5" (E fills in); F typed 1" long is off by 1". The read-only wording is listed in vault/build/assumptions.md
// EZD-1419.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateHost } from '../components/states/StateHost';
import { MessagesProvider } from '../lib/messages';
import { catalogFor } from '../server/messages/catalog';
import { FieldMeasureScreen } from './FieldMeasureScreen';
import { initialRooms, withShape, type FieldRoom } from './rooms';

// EZD-2025: the back link is moved by the router (no next/link in the first load); no router is mounted here.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, prefetch: () => {} }) }));

function render(rooms: FieldRoom[], sentAt: string | null = null, language: 'en' | 'es' = 'en') {
  return renderToStaticMarkup(
    <MessagesProvider language={language} messages={catalogFor('field', language)}>
      <StateHost>
        <FieldMeasureScreen
          projectId="00000000-0000-4000-8000-000000000001"
          projectName="Hendricks residence"
          initialRooms={rooms}
          canEdit
          canReopen
          sentAt={sentAt}
        />
      </StateHost>
    </MessagesProvider>,
  );
}

const state = (html: string) => /data-testid="field-measure" data-state="([a-z]+)"/.exec(html)?.[1];
const l = (lengths: (number | null)[]): FieldRoom[] => [
  { ...withShape(initialRooms()[0] as FieldRoom, 'l'), lengths },
];
const SENT = '2026-11-22T15:00:00.000Z';

describe('EZD-1419 Field measure states', () => {
  it('empty room, measuring, closed and off by X', () => {
    expect(state(render(initialRooms()))).toBe('empty');
    expect(state(render(l([218, null, null, null, null, null])))).toBe('measuring');
    expect(state(render(l([218, 108.5, 124.5, 87, null, 195.5])))).toBe('closed');
    expect(state(render(l([218, 108.5, 124.5, 87, null, 196.5])))).toBe('off');
  });

  it('while measuring there is no read-only line', () => {
    expect(render(l([218, null, null, null, null, null]))).not.toContain('measure-read-only');
  });

  it('AC-EZD-1419-2: sent rooms are read-only: the line, no keypad, no + Room, shapes and ceiling disabled', () => {
    const html = render(l([218, 108.5, 124.5, 87, null, 195.5]), SENT);
    expect(state(html)).toBe('sent');
    expect(html).toMatch(
      /data-testid="measure-read-only"[^>]*>.*Sent to the office. Read-only until the office reopens it.</,
    );
    expect(html).not.toContain('data-testid="keypad"');
    expect(html).not.toContain('data-add-room');
    expect(html.match(/<button[^>]*data-shape[^>]*>/g)?.every((b) => b.includes('disabled'))).toBe(
      true,
    );
    expect(html).toMatch(/<input[^>]*disabled/);
  });

  it('Spanish read-only line', () => {
    expect(render(l([218, null, null, null, null, null]), SENT, 'es')).toContain(
      'Enviado a la oficina. Solo lectura hasta que la oficina lo reabra.',
    );
  });
});
