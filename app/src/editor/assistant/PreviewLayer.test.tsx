// EZD-5604b L1, L2 (vault/plans/EZD-5604b.md section 4; AC-EZD-5604-3, -9; Q-0662 (a); 11 rule 4). The layer's
// markup is read as static markup; its writes are checked on fake elements and a fake handle, since the app's unit
// tests have no DOM (vault/build/assumptions.md EZD-105b, EZD-5604b). Wording: approved S03c legend and chip
// ("Door 3 · 3' 0\"", formatLength(36, 2) = 3' 0"); 8/3 px per inch.
import {
  createOpeningData,
  CURRENT_SCHEMA_VERSION,
  withObjectNumber,
  type Point,
} from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createModelStore } from '../model/model-store';
import type { PlanCanvasHandle } from '../plan/controller';
import { baseObjects, uid, wallsOf, withWalls } from '../tools/test-utils/fixtures';
import type { OkPreview } from './apply-reply';
import { createPreviewStore } from './preview-store';
import { previewGeometry, previewPaths } from './preview-shapes';
import {
  bindPreviewWrites,
  PreviewLayer,
  previewShown,
  type PreviewElements,
} from './PreviewLayer';
import { els, render, text } from './preview-markup.test-helpers';

const T = (p: Point): Point => ({ x: (p.x * 8) / 3, y: (-p.y * 8) / 3 });

function doorSetup() {
  const before = withWalls(
    baseObjects(),
    1,
    [
      { x: 0, y: 0 },
      { x: 144, y: 0 },
    ],
    false,
  );
  const door = withObjectNumber(
    {
      type: 'opening',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: createOpeningData({
        kind: 'door',
        host: wallsOf(before)[0]!,
        center: { x: 72, y: 0 },
      }) as unknown as Record<string, unknown>,
    } as ObjectValue,
    3,
  );
  const preview: OkPreview = {
    ok: true,
    changes: [{ id: uid(50), value: door }],
    added: [uid(50)],
    removed: [],
    updated: [],
    // The host wall is touched too, as apply-reply's touched set lists an opening's host.
    touched: [uid(50), uid(1)],
    provisional: { [uid(50)]: 3 },
  };
  const model = createModelStore({ objects: before });
  const store = createPreviewStore({ store: model });
  store.open({ preview, prompt: 'add a door', entryId: 1, before });
  return { before, preview, model, store };
}

type Listener = (view: never) => void;
function fakeHandle(toScreen: (p: Point) => Point) {
  const h = {
    toScreen,
    listeners: new Set<Listener>(),
    modelToScreen: (p: Point) => h.toScreen(p),
    onCameraChange(fn: Listener) {
      h.listeners.add(fn);
      return () => h.listeners.delete(fn);
    },
  };
  return h;
}

function fakeElements(chipIds: string[]) {
  const attrs: Record<string, string> = {};
  const el = (name: string) => ({
    setAttribute: (k: string, v: string) => {
      if (k === 'd') attrs[name] = v;
    },
    removeAttribute: () => {},
  });
  const chips = new Map(chipIds.map((id) => [id, { style: { transform: '' } }]));
  const els: PreviewElements = {
    addFill: el('addFill'),
    removeFill: el('removeFill'),
    remove: el('remove'),
    add: el('add'),
    addLeaf: el('addLeaf'),
    addArc: el('addArc'),
    chips,
  };
  return { els, attrs, chips };
}

describe('EZD-5604b PreviewLayer', () => {
  it('L1 shown with legend and chip; hidden when stale or rejected', () => {
    const { before, preview, model, store } = doorSetup();
    const handle = fakeHandle(T) as unknown as PlanCanvasHandle;
    const html = render(<PreviewLayer store={store} handle={handle} />);
    expect(els(html, 'preview-layer')).toHaveLength(1);
    expect(text(els(html, 'preview-legend')[0]!.outer)).toBe(
      'Preview blue is added red dashed is removed',
    );
    const chips = els(html, 'preview-chip');
    expect(chips).toHaveLength(1);
    expect(text(chips[0]!.outer)).toBe('Door 3 · 3\' 0"');
    expect(chips[0]!.open).toContain(`data-object-id="${uid(50)}"`);
    const order = [
      'preview-add-fill',
      'preview-remove-fill',
      'preview-remove',
      'preview-add',
      'preview-add-leaf',
      'preview-add-arc',
    ];
    const at = order.map((id) => html.indexOf(`data-testid="${id}"`));
    expect(at.every((i, k) => i >= 0 && (k === 0 || i > at[k - 1]!))).toBe(true);

    // The writes the layer makes at mount.
    const g = previewGeometry(before, preview);
    const { els: fake, attrs, chips: chipEls } = fakeElements([uid(50)]);
    bindPreviewWrites(fakeHandle(T), fake, g);
    expect(attrs.addFill).toBe(previewPaths(g, T).addFill);
    expect(attrs.addFill).toBe('M 144 0 L 240 0 L 240 12 L 144 12 Z');
    expect(chipEls.get(uid(50))!.style.transform).toBe(
      'translate(192px, 36px) translate(-50%, -50%)',
    );

    const wall = model.getState().objects.get(uid(1))!;
    const data = wall.data as { attributes: Record<string, unknown> };
    model.applyEdit([
      {
        id: uid(1),
        value: { ...wall, data: { ...data, attributes: { ...data.attributes, height: 90 } } },
      },
    ]);
    expect(previewShown(store.getState())).toBe(false);
    expect(els(render(<PreviewLayer store={store} handle={handle} />), 'preview-layer')).toEqual(
      [],
    );
    store.reject();
    expect(els(render(<PreviewLayer store={store} handle={handle} />), 'preview-layer')).toEqual(
      [],
    );
  });

  it('L2 a camera change rewrites the elements straight, and the cleanup stops it', () => {
    const { before, preview } = doorSetup();
    const g = previewGeometry(before, preview);
    const handle = fakeHandle(T);
    const { els: fake, attrs, chips } = fakeElements([uid(50)]);
    const stop = bindPreviewWrites(handle, fake, g);
    handle.toScreen = (p) => ({ x: (p.x * 16) / 3, y: (-p.y * 16) / 3 });
    expect(handle.listeners.size).toBe(1);
    for (const l of handle.listeners) l(undefined as never);
    expect(attrs.addFill).toBe('M 288 0 L 480 0 L 480 24 L 288 24 Z');
    expect(chips.get(uid(50))!.style.transform).toBe(
      'translate(384px, 36px) translate(-50%, -50%)',
    );
    stop();
    expect(handle.listeners.size).toBe(0);
  });
});
