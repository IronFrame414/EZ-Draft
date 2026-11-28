// EZD-2025 (audit 2026-11-27 A5, A6; Q-0903 "Not saved to the office. Retry" decided; AC-EZD-2025-3, AC-EZD-2025-4, AC-EZD-2025-5). Static
// markup, as TasksPanel.test.tsx: a check the office refused for good shows unticked with the decided line (role
// "alert") and Retry; when the field sender could not start, a line says why the controls are missing. The taps
// (a failed store, Retry) are covered by e2e/ezd-2025-field-failures.spec.ts. Other wording: proposed for Josh in
// vault/build/assumptions/EZD-2025.md.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../lib/messages';
import { catalogFor } from '../server/messages/catalog';
import { ALL_ROOMS } from './pack-view';
import { TasksPanel, type TaskActions } from './TasksPanel';
import type { FieldPackTask } from './types';

const TASKS: FieldPackTask[] = [
  {
    id: 't1',
    roomId: 'r1',
    room: 'Kitchen',
    phase: 'Demo',
    phasePosition: 0,
    position: 0,
    textEn: 'Remove upper cabinets',
    textEs: 'Quitar los gabinetes altos',
    done: null,
    photos: 0,
  },
  {
    id: 't2',
    roomId: 'r1',
    room: 'Kitchen',
    phase: 'Demo',
    phasePosition: 0,
    position: 1,
    textEn: 'Pull the pantry shelves',
    textEs: null,
    done: null,
    photos: 0,
  },
];

const ACTIONS = (o: Partial<TaskActions> = {}): TaskActions => ({
  canCheck: true,
  canEdit: false,
  online: true,
  check: async () => 'ok' as const,
  addPhoto: async () => 'ok',
  edit: async () => true,
  ...o,
});

function render(o: { actions: TaskActions | null; senderFailed?: boolean; language?: 'en' | 'es' }) {
  const language = o.language ?? 'en';
  return renderToStaticMarkup(
    <MessagesProvider language={language} messages={catalogFor('field', language)}>
      <TasksPanel
        tasks={TASKS}
        room={ALL_ROOMS}
        language={language}
        canPhoto={false}
        actions={o.actions}
        senderFailed={o.senderFailed}
      />
    </MessagesProvider>,
  );
}

const row = (html: string, id: string) => html.match(new RegExp(`<li[^>]*data-task="${id}"[\\s\\S]*?</li>`))![0];

describe('EZD-2025 task checks the office refused', () => {
  it('AC-EZD-2025-3, AC-EZD-2025-5 a refused check is unticked with "Not saved to the office." and Retry (role alert)', () => {
    const html = render({ actions: ACTIONS({ refused: new Set(['t1']), retry: async () => 'ok' }) });
    const refused = row(html, 't1');
    expect(refused).toMatch(/<input[^>]*type="checkbox"/);
    expect(refused).not.toMatch(/<input[^>]*checked/);
    expect(refused).toMatch(/role="alert"[^>]*data-testid="task-not-saved"/);
    expect(refused).toContain('Not saved to the office.');
    expect(refused).toMatch(/<button[^>]*>Retry<\/button>/);
    // The other task has no line.
    expect(row(html, 't2')).not.toContain('task-not-saved');
  });

  it('no refused checks, no line', () => {
    expect(render({ actions: ACTIONS() })).not.toContain('Not saved to the office.');
  });

  it('Spanish', () => {
    const html = render({
      actions: ACTIONS({ refused: new Set(['t1']), retry: async () => 'ok' }),
      language: 'es',
    });
    expect(html).toContain('No se guardó en la oficina.');
    expect(html).toContain('Reintentar');
  });
});

describe('EZD-2025 the field sender could not start', () => {
  const LINE =
    "Ticking tasks, Add photo and Edit aren&#x27;t available on this phone right now. They come back when you&#x27;re back online.";

  it('AC-EZD-2025-4 with no controls, a line says why', () => {
    const html = render({ actions: null, senderFailed: true });
    expect(html).toContain('data-testid="tasks-sender-failed"');
    expect(html).toContain(LINE);
    expect(html).not.toMatch(/type="checkbox"/);
  });

  it('while the sender is starting, or once it runs, no line', () => {
    expect(render({ actions: null })).not.toContain('tasks-sender-failed');
    expect(render({ actions: ACTIONS(), senderFailed: true })).not.toContain('tasks-sender-failed');
  });
});
