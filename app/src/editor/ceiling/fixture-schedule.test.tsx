// EZD-508 (AC-EZD-508-1 "Counts update when lights are placed or deleted."; S05 Controls "Fixture schedule rows | Left
// panel | One row per type tag (A, F, S, T): tag, description, count. Click selects all fixtures of that type on
// canvas."; board S05Ceiling left panel "Fixture schedule", "×8"; vault/build/assumptions.md EZD-508: untagged
// fixtures count in one row per kind after the tagged rows, Demo fixtures are left out, the description is the kind
// with ", 3000K" when the color temperature is set). Lights are placed with the EZD-507 ceiling tool on the tools
// fixture room (floor F1) and deleted with a model edit; no browser.
import type { ObjectStatus, Point } from '@ezdraft/geometry';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { elements, textOf } from '../../../test-harness/projects-markup';
import { eyeDefaults, type PhaseEyes } from '../../lib/plan/phase-view';
import { createLayerSetting, type LayerPhase } from '../layers/layer-setting';
import { LeftPanel } from '../layers/LeftPanel';
import { createModelStore } from '../model/model-store';
import type { PlanPointerEvent } from '../plan/input';
import { createDeviceChoice, type CeilingDeviceToolId } from '../tools/ceiling-device-tool';
import { fixtureTypeEdit } from '../tools/fixture-type';
import { deviceToolReceiver } from '../tools/ceiling-device-receiver';
import { placeCeilingDevice, type CeilingDeviceKind } from '../tools/fixture-tool';
import { F1, F2, ROOM, idSeq, roomValue, uid } from '../tools/test-utils/fixtures';
import { FixtureSchedule } from './FixtureSchedule';
import { fixtureScheduleRows } from './fixture-schedule';
import { createSurfaceSetting, type PlanSurface } from './surface';

const P = (x: number, y: number): Point => ({ x, y });

function setup() {
  const objects = new Map(ROOM);
  objects.set(uid(60), roomValue([P(0, 0), P(144, 0), P(144, 120), P(0, 120)], 'Family room', null));
  const store = createModelStore({ objects });
  const choice = createDeviceChoice();
  const newId = idSeq(700);
  let status: ObjectStatus = 'new';
  const place = (tool: CeilingDeviceToolId, kind: CeilingDeviceKind, at: Point): string => {
    choice.set(tool, kind);
    const before = new Set(store.getState().objects.keys());
    deviceToolReceiver({
      store,
      tool,
      choice,
      chosenFloor: () => F1,
      newStatus: () => status,
      newId,
      select: () => {},
      onMessage: () => {},
      place: placeCeilingDevice,
    })({ kind: 'click', model: at } as unknown as PlanPointerEvent);
    const added = [...store.getState().objects.keys()].filter((id) => !before.has(id));
    expect(added).toHaveLength(1);
    return added[0]!;
  };
  const light = (x: number) => place('recessed-light', 'recessed_light', P(x, 30));
  const fan = () => place('ceiling-fan', 'ceiling_fan', P(72, 60));
  const tag = (id: string, field: 'typeTag' | 'colorTemp', text: string) => {
    const r = fixtureTypeEdit(store.getState().objects, id, { field, text });
    expect(r.ok).toBe(true);
    if (r.ok) store.applyEdit([r.change]);
  };
  const remove = (id: string) => store.applyEdit([{ id, value: null }]);
  const rows = (floor: string = F1) => fixtureScheduleRows(store.getState().objects, floor);
  const setStatus = (s: ObjectStatus) => {
    status = s;
  };
  return { store, light, fan, tag, remove, rows, setStatus };
}

const counts = (rows: ReturnType<ReturnType<typeof setup>['rows']>) =>
  rows.map((r) => [r.tag, r.kind, r.count]);

describe('EZD-508 fixture schedule rows', () => {
  it('AC-EZD-508-1 the count goes up with each light placed and down with each light deleted', () => {
    const s = setup();
    expect(s.rows()).toEqual([]);
    const a = s.light(20);
    expect(counts(s.rows())).toEqual([[null, 'recessed_light', 1]]);
    const b = s.light(50);
    const c = s.light(80);
    expect(counts(s.rows())).toEqual([[null, 'recessed_light', 3]]);
    s.remove(b);
    expect(counts(s.rows())).toEqual([[null, 'recessed_light', 2]]);
    expect(s.rows()[0]!.ids).toEqual([a, c]);
    s.remove(a);
    s.remove(c);
    expect(s.rows()).toEqual([]);
  });

  it('AC-EZD-508-1 one row per type tag, sorted by tag, with the untagged lights after; counts follow placing and deleting', () => {
    const s = setup();
    const a1 = s.light(20);
    const a2 = s.light(50);
    const t1 = s.light(80);
    const f = s.fan();
    const loose = s.light(110);
    s.tag(t1, 'typeTag', 'T');
    s.tag(f, 'typeTag', 'F');
    s.tag(a1, 'typeTag', 'A');
    s.tag(a2, 'typeTag', 'A');
    s.tag(a1, 'colorTemp', '3000');
    expect(counts(s.rows())).toEqual([
      ['A', 'recessed_light', 2],
      ['F', 'ceiling_fan', 1],
      ['T', 'recessed_light', 1],
      [null, 'recessed_light', 1],
    ]);
    expect(s.rows()[0]!.ids).toEqual([a1, a2]);
    expect(s.rows()[0]!.colorTemp).toBe(3000);
    // A new light tagged A joins row A; deleting the tagged T drops its row.
    const a3 = s.light(130);
    s.tag(a3, 'typeTag', 'A');
    s.remove(t1);
    expect(counts(s.rows())).toEqual([
      ['A', 'recessed_light', 3],
      ['F', 'ceiling_fan', 1],
      [null, 'recessed_light', 1],
    ]);
    s.remove(loose);
    expect(counts(s.rows())).toEqual([
      ['A', 'recessed_light', 3],
      ['F', 'ceiling_fan', 1],
    ]);
  });

  it('leaves out Demo fixtures and other floors', () => {
    const s = setup();
    s.light(20);
    s.setStatus('demo');
    s.light(50);
    s.setStatus('existing');
    s.light(80);
    expect(counts(s.rows())).toEqual([[null, 'recessed_light', 2]]);
    expect(s.rows(F2)).toEqual([]);
  });
});

function phase(): LayerPhase {
  const eyes: PhaseEyes = eyeDefaults('proposed');
  return {
    get: () => ({ eyes }),
    version: () => 0,
    setEye: () => {},
    subscribe: () => () => {},
  };
}

function render(
  s: ReturnType<typeof setup>,
  surface: PlanSurface,
  picked: string[][] = [],
): string {
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <LeftPanel
        store={s.store}
        layers={createLayerSetting(phase())}
        selection={{
          getUi: () => ({ ids: [], selectMore: false }),
          subscribe: () => () => {},
          select: (ids) => picked.push([...ids]),
        }}
        showObject={() => true}
        canEdit={false}
        surface={createSurfaceSetting(surface)}
        ceiling={<FixtureSchedule store={s.store} onPick={(ids) => picked.push([...ids])} />}
      />
    </MessagesProvider>,
  );
}

const rowTexts = (html: string) =>
  elements(html, 'fixture-schedule-row').map((r) =>
    ['fixture-schedule-tag', 'fixture-schedule-description', 'fixture-schedule-count'].map((id) =>
      textOf(elements(r.inner, id)[0]!.inner),
    ),
  );

describe('EZD-508 fixture schedule in the left panel', () => {
  it('AC-EZD-508-1 on Ceiling the panel shows "Fixture schedule" rows (tag, description, ×count) that follow placing and deleting', () => {
    const s = setup();
    let html = render(s, 'ceiling');
    expect(textOf(elements(html, 'fixture-schedule')[0]!.inner)).toContain('Fixture schedule');
    expect(rowTexts(html)).toEqual([]);
    const a1 = s.light(20);
    const a2 = s.light(50);
    s.tag(a1, 'typeTag', 'A');
    s.tag(a2, 'typeTag', 'A');
    s.tag(a1, 'colorTemp', '3000');
    const f = s.fan();
    s.tag(f, 'typeTag', 'F');
    s.light(80);
    html = render(s, 'ceiling');
    expect(rowTexts(html)).toEqual([
      ['A', 'Recessed light, 3000K', '×2'],
      ['F', 'Ceiling fan', '×1'],
      ['—', 'Recessed light', '×1'],
    ]);
    s.remove(a2);
    expect(rowTexts(render(s, 'both'))[0]).toEqual(['A', 'Recessed light, 3000K', '×1']);
  });

  it('the schedule is on Ceiling and Both only, and a view-only user sees it too', () => {
    const s = setup();
    s.light(20);
    expect(elements(render(s, 'floor'), 'fixture-schedule')).toHaveLength(0);
    expect(elements(render(s, 'both'), 'fixture-schedule-row')).toHaveLength(1);
  });
});
