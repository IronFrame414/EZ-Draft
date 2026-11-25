// EZD-1404 (S17 Layout header and tab bar; Controls "Revision badge" ("Version 3" before the permit), "Project title /
// subtitle" ("Kitchen remodel · Hendricks"; "Field pack · issued Oct 8 · A3.0 Proposed plan", S17 Decision 9), "Room
// chips" (one per room plus All), Tab bar "Plan, 3D, Measure, Tasks (count of open tasks), Photo", Tab: Photo
// "Hidden without Photo notes"; States "No set sent yet": "No field pack issued yet."; Q-0190 / Q-0401: no EZ Binder
// link in v1; Data shown "Spanish users always see Spanish"). Static markup, as the field measure component tests;
// the badge tap and the tab and chip taps are covered by e2e/field-pack.spec.ts.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StateHost } from '../components/states/StateHost';
import { MessagesProvider } from '../lib/messages';
import { catalogFor } from '../server/messages/catalog';
import { FieldPackView } from './FieldPackView';
import { packDate, packTabs, packTitle } from './pack-view';
import type { FieldPackView as PackData } from './types';

const DATA: PackData = {
  projectName: 'Kitchen remodel',
  clientName: 'Hendricks',
  pack: {
    issueId: 'i1',
    revision: { kind: 'version', no: 3 },
    // Noon UTC: Oct 8 in every US time zone.
    issuedAt: '2026-10-08T16:00:00.000Z',
    note: 'Sink base widened',
    rooms: [
      { id: 'r1', name: 'Kitchen' },
      { id: 'r2', name: 'Pantry' },
    ],
    openTasks: 4,
  },
};

function render(
  data: PackData,
  o: { canPhoto?: boolean; language?: 'en' | 'es' } = {},
): string {
  const language = o.language ?? 'en';
  return renderToStaticMarkup(
    <MessagesProvider language={language} messages={catalogFor('field', language)}>
      <StateHost>
        <FieldPackView data={data} language={language} canPhoto={o.canPhoto ?? true} />
      </StateHost>
    </MessagesProvider>,
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const tabs = (html: string) =>
  [...html.matchAll(/<button[^>]*role="tab"[^>]*data-tab="([a-z0-9]+)"/g)].map((m) => m[1]);

describe('EZD-1404 field pack shell', () => {
  it('header: title, subtitle, Version badge and room chips with All first', () => {
    const html = render(DATA);
    expect(html).toContain('>Kitchen remodel · Hendricks</h1>');
    expect(text(html)).toContain('Field pack · issued Oct 8 · A3.0 Proposed plan');
    expect(html).toMatch(/data-testid="revision-badge"[^>]*>Version 3</);
    const chips = [...html.matchAll(/data-room="[^"]+"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(chips).toEqual(['All', 'Kitchen', 'Pantry']);
    expect(html).toMatch(/aria-pressed="true" data-room="all"/);
    // The revision note shows only after a tap.
    expect(html).not.toContain('revision-note');
  });

  it('no EZ Binder link in v1 (Q-0190, Q-0401)', () => {
    expect(render(DATA)).not.toMatch(/EZ Binder/i);
  });

  it('tab bar: Plan, 3D, Measure, Tasks with the open count, Photo; Plan selected', () => {
    const html = render(DATA);
    expect(tabs(html)).toEqual(['plan', '3d', 'measure', 'tasks', 'photo']);
    expect(html).toMatch(/aria-selected="true"[^>]*data-tab="plan"/);
    expect(html).toMatch(/data-testid="open-tasks" aria-label="4 open tasks">4</);
  });

  it('Photo is hidden without Photo notes', () => {
    expect(tabs(render(DATA, { canPhoto: false }))).toEqual([
      'plan',
      '3d',
      'measure',
      'tasks',
    ]);
    expect(render(DATA, { canPhoto: false })).not.toContain('data-tab="photo"');
  });

  it('no open tasks: no count on Tasks', () => {
    expect(render({ ...DATA, pack: { ...DATA.pack!, openTasks: 0 } })).not.toContain('open-tasks');
  });

  it('no set sent yet: "No field pack issued yet." with no tabs', () => {
    const html = render({ ...DATA, pack: null });
    expect(html).toContain('No field pack issued yet.');
    expect(html).toContain('data-state="none"');
    expect(html).not.toContain('role="tablist"');
  });

  it('a Spanish user sees Spanish', () => {
    const html = text(render(DATA, { language: 'es' }));
    expect(html).toContain('Paquete de obra');
    expect(html).toContain('Versión 3');
    expect(html).toContain('Plano');
    expect(html).toContain('Tareas');
    expect(render({ ...DATA, pack: null }, { language: 'es' })).toContain(
      'Todavía no se ha emitido un paquete de obra.',
    );
  });
});

describe('EZD-1404 header text rules', () => {
  it('title is the project, then the client when there is one', () => {
    expect(packTitle('Kitchen remodel', 'Hendricks')).toBe('Kitchen remodel · Hendricks');
    expect(packTitle('Kitchen remodel', null)).toBe('Kitchen remodel');
  });

  it('dates: "Oct 8" in the subtitle, with the year in the revision note', () => {
    const at = '2026-10-08T16:00:00.000Z';
    expect(packDate(at, 'en', false, 'America/New_York')).toBe('Oct 8');
    expect(packDate(at, 'en', true, 'America/New_York')).toBe('Oct 8, 2026');
  });

  it('tabs: Photo only with Photo notes', () => {
    expect(packTabs({ canPhoto: true })).toEqual(['plan', '3d', 'measure', 'tasks', 'photo']);
    expect(packTabs({ canPhoto: false })).toEqual(['plan', '3d', 'measure', 'tasks']);
  });
});
