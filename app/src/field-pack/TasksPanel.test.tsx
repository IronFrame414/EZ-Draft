// EZD-1409 (AC-EZD-1409-1 "Seeded published tasks show grouped by phase"; S17 Tab: Tasks; Task row: checkbox "Hidden
// without Check off tasks", add photo "Photo notes", edit text "Edit field tasks"; Permissions "Controls the user
// lacks are hidden"; assumptions EZD-1409 wording "No tasks in this field pack yet.", "Done by {name} · {date time}").
// Static markup, as FieldPackView.test.tsx; the taps are covered by e2e/field-pack-tasks.spec.ts.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../lib/messages';
import { catalogFor } from '../server/messages/catalog';
import { FieldPackView } from './FieldPackView';
import { ALL_ROOMS } from './pack-view';
import { TasksPanel, type TaskActions } from './TasksPanel';
import type { FieldPackTask, FieldPackView as PackData } from './types';

const T = (o: Partial<FieldPackTask> & Pick<FieldPackTask, 'id' | 'phase' | 'phasePosition' | 'textEn'>) => ({
  roomId: 'r1',
  room: 'Kitchen',
  position: 0,
  textEs: null,
  done: null,
  photos: 0,
  ...o,
});

const TASKS: FieldPackTask[] = [
  T({ id: 't1', phase: 'Demo', phasePosition: 0, textEn: 'Remove upper cabinets' }),
  T({ id: 't2', phase: 'Rough-in', phasePosition: 1, textEn: 'Rough in the sink drain', photos: 2 }),
  T({
    id: 't3',
    phase: 'Finish',
    phasePosition: 4,
    textEn: 'Set the vanity',
    textEs: 'Colocar el tocador',
    done: { by: 'Luis Ortega', at: '2026-11-21T14:30:00Z' },
  }),
];

const ACTIONS = (o: Partial<TaskActions> = {}): TaskActions => ({
  canCheck: true,
  canEdit: true,
  online: true,
  check: () => {},
  addPhoto: async () => 'ok',
  edit: async () => true,
  ...o,
});

function render(
  o: { actions?: TaskActions | null; canPhoto?: boolean; language?: 'en' | 'es'; tasks?: FieldPackTask[] } = {},
) {
  const language = o.language ?? 'en';
  return renderToStaticMarkup(
    <MessagesProvider language={language} messages={catalogFor('field', language)}>
      <TasksPanel
        tasks={o.tasks ?? TASKS}
        room={ALL_ROOMS}
        language={language}
        canPhoto={o.canPhoto ?? true}
        actions={o.actions === undefined ? ACTIONS() : o.actions}
      />
    </MessagesProvider>,
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('EZD-1409 Tasks tab', () => {
  it('AC-EZD-1409-1 tasks show under their phase headings in trade order', () => {
    const html = render();
    expect([...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1])).toEqual([
      'Demo',
      'Rough-in',
      'Finish',
    ]);
    const t = text(html);
    expect(t.indexOf('Remove upper cabinets')).toBeLessThan(t.indexOf('Rough in the sink drain'));
    expect(t).toContain('Done by Luis Ortega · Nov 21');
    expect(t).toContain('2 photos');
  });

  it('a done task shows checked and locked; an open one unchecked', () => {
    const html = render();
    const box = (name: string) =>
      [...html.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)].map((m) => m[0]).find((b) => b.includes(name))!;
    expect(box('Mark done: Remove upper cabinets')).not.toContain('checked');
    expect(box('Mark done: Remove upper cabinets')).not.toContain('disabled');
    expect(box('Mark done: Set the vanity')).toContain('checked=""');
    expect(box('Mark done: Set the vanity')).toContain('disabled=""');
  });

  it('controls the user lacks are hidden', () => {
    const none = render({ actions: ACTIONS({ canCheck: false, canEdit: false }), canPhoto: false });
    expect(none).not.toContain('type="checkbox"');
    expect(none).not.toContain('Add photo');
    expect(none).not.toContain('>Edit<');
    const all = render();
    expect(all).toContain('Add photo');
    expect(all).toContain('Edit');
  });

  it('Spanish users see the Spanish text and labels', () => {
    const t = text(render({ language: 'es' }));
    expect(t).toContain('Colocar el tocador');
    expect(t).toContain('Hecha por Luis Ortega');
    expect(t).toContain('Agregar foto');
  });

  it('no tasks: the empty line', () => {
    expect(text(render({ tasks: [] }))).toContain('No tasks in this field pack yet.');
  });

  it('the tab badge counts the open tasks of the pack', () => {
    const data: PackData = {
      projectName: 'Kitchen remodel',
      clientName: 'Hendricks',
      pack: {
        issueId: 'i1',
        revision: { kind: 'version', no: 2 },
        issuedAt: '2026-10-08T16:00:00.000Z',
        note: null,
        rooms: [{ id: 'r1', name: 'Kitchen' }],
        openTasks: 2,
        tasks: TASKS,
      },
    };
    const html = renderToStaticMarkup(
      <MessagesProvider language="en" messages={catalogFor('field', 'en')}>
        <FieldPackView
          data={data}
          language="en"
          canPhoto
          initialTab="tasks"
          overlay={{ checked: new Map([['t1', 0]]), photos: new Map(), edited: new Map(), me: null }}
        />
      </MessagesProvider>,
    );
    expect(html).toMatch(/data-testid="open-tasks"[^>]*>1</);
    expect(text(html)).toContain('Remove upper cabinets');
  });
});
