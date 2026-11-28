// EZD-2025 (audit 2026-11-27 A3, A4; Q-0903 "Not saved to the office. Retry" decided; AC-EZD-2025-1, AC-EZD-2025-2, AC-EZD-2025-5). Static
// markup, as the other field measure component tests (no DOM environment): the not-saved line with Retry, and Send
// to office in the menu with the reason it is greyed. The refused saves, the 409 and the failed queueing are covered
// by e2e/ezd-2025-field-failures.spec.ts. Other wording: proposed for Josh in vault/build/assumptions/EZD-2025.md.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { FieldSenderState } from '../components/outbox/OutboxDrain';
import { MessagesProvider } from '../lib/messages';
import { catalogFor } from '../server/messages/catalog';
import { en } from '../server/messages/catalogs/en';
import { es } from '../server/messages/catalogs/es';
import { NotSavedLine } from './NotSavedLine';
import { SendMenuItem } from './SendMenuItem';

const wrap = (node: React.ReactNode, language: 'en' | 'es' = 'en') =>
  renderToStaticMarkup(
    <MessagesProvider language={language} messages={catalogFor('field', language)}>
      {node}
    </MessagesProvider>,
  );

describe('EZD-2025 Not saved to the office', () => {
  it('AC-EZD-2025-1, AC-EZD-2025-5 the decided line, role alert, with a Retry button', () => {
    const html = wrap(<NotSavedLine testId="measure-not-saved" onRetry={() => {}} />);
    expect(html).toMatch(/<p[^>]*role="alert"[^>]*data-testid="measure-not-saved"/);
    expect(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).toBe(
      'Not saved to the office. Retry',
    );
    expect(html).toMatch(/<button type="button"[^>]*>Retry<\/button>/);
  });

  it('Spanish', () => {
    const html = wrap(<NotSavedLine onRetry={() => {}} />, 'es');
    expect(html).toContain('No se guardó en la oficina.');
    expect(html).toContain('>Reintentar</button>');
  });
});

describe('EZD-2025 Send to office greyed with its reason', () => {
  const item = (senderState: FieldSenderState, canEdit = true) =>
    wrap(<SendMenuItem canEdit={canEdit} senderState={senderState} onSend={() => {}} />);

  it('AC-EZD-2025-2 the sender has not started: greyed, the reason beside it', () => {
    const html = item('starting');
    expect(html).toMatch(/<button[^>]*role="menuitem"[^>]*disabled=""[^>]*aria-describedby="([^"]+)"/);
    const id = html.match(/aria-describedby="([^"]+)"/)![1];
    expect(html).toMatch(new RegExp(`<span id="${id}"[^>]*data-testid="send-reason">Getting ready to send…</span>`));
  });

  it('AC-EZD-2025-2 the sender could not start: greyed, says it tries again online', () => {
    const html = item('failed');
    expect(html).toMatch(/role="menuitem"[^>]*disabled=""/);
    expect(html).toContain(
      'Can&#x27;t send from this phone right now. It tries again when you&#x27;re back online.',
    );
  });

  it('the sender runs: Send to office enabled, no reason', () => {
    const html = item('ready');
    expect(html).not.toContain('disabled');
    expect(html).not.toContain('send-reason');
  });

  it('view only (no Send field measurement): greyed with no reason, as before', () => {
    const html = item('failed', false);
    expect(html).toMatch(/role="menuitem"[^>]*disabled=""/);
    expect(html).not.toContain('send-reason');
  });

  it('Spanish', () => {
    expect(
      wrap(<SendMenuItem canEdit senderState="failed" onSend={() => {}} />, 'es'),
    ).toContain('No se puede enviar desde este teléfono ahora.');
  });
});

// AC-EZD-2025-5: "Not saved to the office. Retry" is used as decided (Q-0903), and every other new line is in the
// message catalogs in English and Spanish. The wording is the one listed for Josh in
// vault/build/assumptions/EZD-2025.md.
describe('AC-EZD-2025-5 the new lines are in the English and Spanish catalogs', () => {
  const LINES = {
    'field.sync.not_saved': ['Not saved to the office.', 'No se guardó en la oficina.'],
    'field.measure.send_failed': [
      "Couldn't keep the rooms on this phone to send. Free up space and try again.",
      'No se pudieron guardar las habitaciones en este teléfono para enviarlas. Libera espacio e inténtalo de nuevo.',
    ],
    'field.measure.send_starting': ['Getting ready to send…', 'Preparando el envío…'],
    'field.measure.send_unavailable': [
      "Can't send from this phone right now. It tries again when you're back online.",
      'No se puede enviar desde este teléfono ahora. Se intentará de nuevo cuando vuelvas a tener conexión.',
    ],
    'field.tasks.check_failed': [
      "The tick wasn't saved on this phone. Try again.",
      'La marca no se guardó en este teléfono. Inténtalo de nuevo.',
    ],
    'field.tasks.sender_failed': [
      "Ticking tasks, Add photo and Edit aren't available on this phone right now. They come back when you're back online.",
      'Marcar tareas, Agregar foto y Editar no están disponibles en este teléfono ahora. Vuelven cuando tengas conexión.',
    ],
  } as const;

  for (const [key, [english, spanish]] of Object.entries(LINES)) {
    it(`${key} in English and Spanish`, () => {
      expect(en[key as keyof typeof LINES]).toBe(english);
      expect(es[key as keyof typeof LINES]).toBe(spanish);
    });
  }

  it('the decided line reads "Not saved to the office. Retry" with the shared Retry word', () => {
    expect(`${en['field.sync.not_saved']} ${en['common.retry']}`).toBe('Not saved to the office. Retry');
    expect(es['common.retry']).toBe('Reintentar');
  });
});
