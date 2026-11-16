// EZD-214 (AC-EZD-214-4, -5; 05 Q-0664 "Status on objects"; S03 Decisions "Demo is set per object"; S03 Inspector
// "Bearing wall cannot be set to Demo without engineer prompt"; Q-0630 row 9; Q-0669 (a)). Expected values: Q-0664
// (a Status select Existing / Demo / New on walls, doors and windows; bulk shares Status, Mixed when they differ, one
// undo step), "set per object" (no cascade to hosted openings), and the EZD-233 bearing refusal message. Real model
// store over the EZD-213a fixtures; no browser, no live service.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { createModelStore } from '../model/model-store';
import type { Objects } from '../model/patches';
import { commitInspectorEdits } from './inspector-input';
import { inspectorView, type InspectorView } from './inspector-view';
import { InspectorContent } from './InspectorPanel';
import { F1, houseObjects, idSeq, uid } from './test-utils/fixtures';

const statusOf = (objects: Objects, id: string) =>
  (objects.get(id)!.data as { status: string }).status;

const setStatus = (
  store: ReturnType<typeof createModelStore>,
  ids: string[],
  value: 'existing' | 'demo' | 'new',
) => commitInspectorEdits({ store, ids, newId: idSeq(900) }, [{ field: 'status', value }]);

function render(v: InspectorView, canEdit = true): string {
  const ui: ReactElement = (
    <InspectorContent
      view={v}
      canEdit={canEdit}
      coarse={false}
      layersEditing={false}
      onToggleLayers={() => {}}
      onCommit={() => null}
      onLayerMaterial={() => null}
    />
  );
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  );
}

const tagOf = (html: string, testId: string) =>
  html.match(new RegExp(`<\\w+[^>]*data-testid="${testId}"[^>]*>`))?.[0] ?? null;

describe('EZD-214 inspector Status', () => {
  it('AC-4 one wall: the select sets its status; the hosted door keeps its own', () => {
    const store = createModelStore({ objects: houseObjects() });
    expect(setStatus(store, [uid(1)], 'demo')).toEqual({ ok: true, changed: 1 });
    const o = store.getState().objects;
    expect(statusOf(o, uid(1))).toBe('demo');
    expect(statusOf(o, uid(30))).toBe('existing');
    expect(store.getState().past).toHaveLength(1);
  });

  it('AC-4 several walls, doors and windows change at once as one undo step', () => {
    const store = createModelStore({ objects: houseObjects() });
    const ids = [uid(1), uid(5), uid(30), uid(32)];
    expect(setStatus(store, ids, 'new')).toEqual({ ok: true, changed: 4 });
    const o = store.getState().objects;
    for (const id of ids) expect(statusOf(o, id), id).toBe('new');
    expect(statusOf(o, uid(31))).toBe('existing');
    expect(store.getState().past).toHaveLength(1);
    store.undo();
    for (const id of ids) expect(statusOf(store.getState().objects, id), id).toBe('existing');
  });

  it('a status already held changes nothing; rooms are left as they are (Q-0669 (a))', () => {
    const store = createModelStore({ objects: houseObjects() });
    expect(setStatus(store, [uid(1)], 'existing')).toEqual({ ok: true, changed: 0 });
    setStatus(store, [uid(5)], 'demo');
    const o = store.getState().objects;
    expect(statusOf(o, uid(20))).toBe('existing');
    expect(statusOf(o, uid(21))).toBe('existing');
    expect([...o.keys()].length).toBe(houseObjects().size);
  });

  it('a bearing wall is not set to Demo; nothing in the selection changes', () => {
    const store = createModelStore({ objects: houseObjects() });
    commitInspectorEdits({ store, ids: [uid(1)], newId: idSeq(900) }, [
      { field: 'wallBearing', value: true },
    ]);
    const r = setStatus(store, [uid(5), uid(1)], 'demo');
    expect(r).toEqual({ ok: false, messageKey: 'office.edit.bearing_demo' });
    expect(statusOf(store.getState().objects, uid(5))).toBe('existing');
    expect(setStatus(store, [uid(1)], 'new')).toEqual({ ok: true, changed: 1 });
  });

  it('AC-4 bulk Status reads Mixed when the selection differs, else the shared value', () => {
    const store = createModelStore({ objects: houseObjects() });
    setStatus(store, [uid(30)], 'new');
    const o = store.getState().objects;
    const mixed = inspectorView(o, F1, [uid(1), uid(30)]);
    expect(mixed.kind === 'bulk' && mixed.status).toEqual({ mixed: true });
    const same = inspectorView(o, F1, [uid(1), uid(5)]);
    expect(same.kind === 'bulk' && same.status).toEqual({ mixed: false, value: 'existing' });

    const html = render(mixed);
    expect(tagOf(html, 'inspector-status')).toMatch(/^<select/);
    expect(html).toMatch(/<option value="" disabled="" selected="">Mixed<\/option>/);
    expect(tagOf(html, 'inspector-status-dot')).toBeNull();
  });

  it('door and window panels show the Status select with the dot; options Existing, Demo, New', () => {
    const store = createModelStore({ objects: houseObjects() });
    setStatus(store, [uid(32)], 'demo');
    const o = store.getState().objects;
    for (const [id, status] of [
      [uid(30), 'existing'],
      [uid(32), 'demo'],
    ] as const) {
      const html = render(inspectorView(o, F1, [id]));
      expect(tagOf(html, 'inspector-status'), id).toMatch(/^<select/);
      expect(tagOf(html, 'inspector-status-dot'), id).toContain(`data-status="${status}"`);
      const options = [...html.matchAll(/<option value="(existing|demo|new)"[^>]*>([^<]*)</g)].map(
        (m) => m[2],
      );
      expect(options, id).toEqual(['Existing', 'Demo', 'New']);
      expect(html.indexOf('data-testid="inspector-impact"'), id).toBeLessThan(
        html.indexOf('data-testid="inspector-status"'),
      );
    }
  });

  it('Q-0630 row 9: a view-only user reads Status as plain text', () => {
    const store = createModelStore({ objects: houseObjects() });
    setStatus(store, [uid(30)], 'new');
    const html = render(inspectorView(store.getState().objects, F1, [uid(30)]), false);
    expect(tagOf(html, 'inspector-status')).toMatch(/^<span/);
    expect(html).not.toContain('<select');
    expect(html).toContain('>New<');
  });
});
