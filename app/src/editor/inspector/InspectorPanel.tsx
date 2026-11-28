'use client';
// EZD-213b Build step 6 (vault/plans/EZD-213b.md section 1, Decided "D-Panel state", "D-Edit layers", "D-Commit",
// "D-Length field", "D-Controls", "D-Layout", "D-Text", "D-View only", "D-Empty", "D-Tiles", "D-Focus Length";
// boards S03dWallSelected, S03dDoorSelected, S03dWindowSelected, S03dStates; S03 Controls — inspector; 04 Left panel
// and inspector; 05 Q-0630 rows 9, 33, 36; Q-0633 G7, G9, G11; Q-0635; Q-0640 row 5-4; Q-0645 (a)): the inspector
// panel for walls, doors, windows and bulk selections. `InspectorContent` takes no store, so static markup renders it.
// EZD-215 (AC-EZD-215-3, -4, -6): one engineer note alone shows its form (EngineerNoteForm); a wall with a note
// whose letter is not on file shows "Engineer required", with or without Edit model.
// EZD-1915 (AC-EZD-1915-1; editor plan 2.5, 5.3 "inspector/kinds/"): each branch is a kind in kinds/registry.ts, one
// file per object type (room, pin, beam, ACT grid, switching zone, device, engineer note, then wall / opening /
// bulk). This file runs the hooks every kind needs, then shows the first kind that names the selection.
import type { FloorChoice } from '../floors/floors';
import { useChosenFloor } from '../floors/use-chosen-floor';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react';
import type { ObjectStatus, WallLayer } from '@ezdraft/geometry';
import { useCoarsePointer } from '../../lib/device/useDeviceLayout';
import type { MessageKey } from '../../server/messages/catalog';
import type { ModelStore } from '../model/model-store';
import { openFloorId } from '../plan/batches';
import type { SelectionController } from '../selection/selection-controller';
import type { DrawingController } from '../tools/drawing-controller';
import { gapSection } from '../tools/gap';
import { newObjectId } from '../tools/model-changes';
import type { InspectorEdit } from './inspector-edits';
import { commitInspectorEdits, layerMaterialEdit } from './inspector-input';
import { inspectorView, withoutRooms, type InspectorView } from './inspector-view';
import type { ResolveGapProps } from './ResolveGap';
import type { SurfaceSetting } from '../ceiling/surface';
import type { FramingDrawing } from '../tools/framing-tool';
import { sameId } from '../shared/ids';
import { useStoreValue } from '../shared/use-store-value';
// The CSS-bearing parts load in the order this file imported them before EZD-1915, so the inspector's CSS keeps its
// order in the build (EZD-1914 rule: keep CSS-bearing imports in their old order); the registry uses them after.
import './InspectorEmpty';
import './ResolveGap';
import './PinPanel';
import './kinds/BeamPanel';
import './kinds/DevicePanel';
import './kinds/SwitchZonePanel';
import './kinds/ActGridPanel';
import './EngineerNoteForm';
import './FramingKnown';
import { inspectorKinds } from './kinds/registry';
import type { InspectorContentProps, InspectorKindContext } from './kinds/types';

export { InspectorContent } from './kinds/objects';
export type { InspectorContentProps } from './kinds/types';

export type InspectorPanelProps = {
  store: ModelStore;
  selection: Pick<SelectionController, 'getUi' | 'subscribe' | 'onDoubleClick'>;
  canEdit: boolean;
  // EZD-213c D-Panel: the gap state and its two actions.
  drawing: Pick<DrawingController, 'getUi' | 'subscribe' | 'startPick' | 'keep'> | null;
  // EZD-214: the phase view's status for rooms a wall edit makes; Existing when not given.
  newStatus?: () => ObjectStatus;
  // EZD-6001 D-Wire: the floor the user chose; without it the lowest floor.
  floors?: FloorChoice;
  // EZD-220: the project a pin photo is sent to; without it a pin's photo is shown but not attached.
  projectId?: string;
  // EZD-515: the Defaults "Fan blade clearance"; null or absent is Not set (no fan check).
  fanClearance?: number | null;
  // EZD-511: the Defaults "ACT minimum border" as a share of the tile; absent is half a tile.
  actMinShare?: number;
  // EZD-514: the page's surface; on Ceiling or Both a room selected alone shows its Framing known section.
  surface?: SurfaceSetting;
  // EZD-514: the page's framing drawing, from the RCP module (rcp.framingDrawingFor), so the section and the framing
  // line tool share one instance across the two lazy parts; absent until the RCP module is in.
  framingDrawing?: FramingDrawing;
};

// EZD-213c D-Panel: no drawing controller, nothing to subscribe to.
export function InspectorPanel({
  store,
  selection,
  canEdit,
  drawing,
  newStatus,
  floors,
  projectId,
  fanClearance = null,
  actMinShare = 0.5,
  surface,
  framingDrawing,
}: InspectorPanelProps): ReactElement {
  const chosen = useChosenFloor(floors);
  const objects = useSyncExternalStore(
    store.subscribe,
    () => store.getState().objects,
    () => store.getState().objects,
  );
  const selected = useSyncExternalStore(selection.subscribe, selection.getUi, selection.getUi);
  // EZD-218 (P213a "Selection ids"; Q-0679 (b)): the inspector never sees a room id, so a room in the selection
  // never makes an edit fail; a room selected alone shows its name and a line pointing to the Rooms tab.
  const ids = useMemo(() => withoutRooms(objects, selected.ids), [objects, selected.ids]);
  const ui = useMemo(() => ({ ...selected, ids }), [selected, ids]);
  const coarse = useCoarsePointer();
  const shownSurface = useStoreValue(surface, (x) => x.get().surface, 'floor');
  const level = openFloorId(objects, chosen);
  const view = useMemo<InspectorView>(
    () =>
      level === null || ui.ids.length === 0
        ? { kind: 'empty' }
        : inspectorView(objects, level, ui.ids),
    [objects, level, ui.ids],
  );
  const idsKey = ui.ids.join(' ');
  // EZD-213c D-Panel: the gap of the one selected wall.
  const drawingUi = useStoreValue(drawing, (d) => d.getUi(), null);
  const state = view.kind === 'wall' && drawingUi !== null ? gapSection(drawingUi, view.id) : null;
  const gap: ResolveGapProps | null =
    state === null || drawing === null
      ? null
      : {
          box: state.box,
          picking: state.picking,
          alert: state.alert,
          coarse,
          onPick: () => drawing.startPick(state.box.wallIds),
          onKeep: () => drawing.keep(state.box.wallIds),
        };

  // D-Edit layers.
  // Reset on a selection change while rendering, not in an effect (react-hooks/set-state-in-effect).
  const [layersFor, setLayersFor] = useState<string | null>(null);
  const [layersIds, setLayersIds] = useState(idsKey);
  if (layersIds !== idsKey) {
    setLayersIds(idsKey);
    setLayersFor(null);
  }
  const layersEditing = layersFor === idsKey && view.kind === 'wall' && canEdit;
  const onToggleLayers = useCallback(
    () => setLayersFor((f) => (f === idsKey ? null : idsKey)),
    [idsKey],
  );

  // D-Commit.
  const onCommit = useCallback(
    (edits: readonly InspectorEdit[]): MessageKey | null => {
      const r = commitInspectorEdits(
        { store, ids: ui.ids, newId: newObjectId, roomStatus: newStatus?.(), chosenFloor: chosen },
        edits,
      );
      return r.ok ? null : r.messageKey;
    },
    [store, ui.ids, newStatus, chosen],
  );
  const onLayerMaterial = useCallback(
    (index: number, material: WallLayer['material']): MessageKey | null => {
      if (level === null || view.kind !== 'wall') return null;
      const e = layerMaterialEdit(objects, level, view.id, index, material);
      if (e === null) return null;
      return onCommit([e]);
    },
    [objects, level, view, onCommit],
  );

  // D-Focus Length.
  const lengthRef = useRef<HTMLInputElement>(null);
  // Each double-click is handled once: the handled count is kept in a ref, not set back in the effect.
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const focusDone = useRef(0);
  useEffect(
    () => selection.onDoubleClick((id) => setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 }))),
    [selection],
  );
  useEffect(() => {
    if (focus === null || focus.n === focusDone.current) return;
    focusDone.current = focus.n;
    const input = lengthRef.current;
    if (view.kind === 'wall' && sameId(view.id, focus.id) && input) {
      input.focus();
      input.select();
    }
  }, [focus, view]);

  const content: InspectorContentProps = {
    view,
    canEdit,
    coarse,
    layersEditing,
    onToggleLayers,
    onCommit,
    onLayerMaterial,
    lengthRef,
    gap,
  };
  const ctx: InspectorKindContext = {
    store,
    objects,
    selectedIds: selected.ids,
    ids,
    canEdit,
    ...(projectId === undefined ? {} : { projectId }),
    fanClearance,
    actMinShare,
    ...(surface === undefined ? {} : { surface }),
    ...(framingDrawing === undefined ? {} : { framingDrawing }),
    shownSurface,
    idsKey,
  };
  // Today's order (editor plan 2.5): the first kind that names an object is shown; the last always does.
  for (const kind of inspectorKinds) {
    const id = kind.match(ctx);
    if (id !== null) return <kind.Panel key={kind.id} ctx={ctx} id={id} content={content} />;
  }
  throw new Error('no inspector kind matched');
}
