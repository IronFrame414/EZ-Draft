// EZD-1915 (AC-EZD-1915-1; editor plan 2.5 "Inspector (right) branches, in order", 5.3 "inspector/kinds/"): the
// shape of one inspector kind. InspectorPanel runs every hook it needs first, then shows the first kind in
// registry.ts whose `match` names an object, as a component (`Panel`). `match` is pure (no hooks), so the order of
// hooks never depends on what is selected (the EZD-213b double-click focus and layer state keep working across kinds).
import type { WallLayer } from '@ezdraft/geometry';
import type { ReactElement, Ref } from 'react';
import type { MessageKey } from '../../../server/messages/catalog';
import type { SurfaceSetting } from '../../ceiling/surface';
import type { ModelStore } from '../../model/model-store';
import type { Objects } from '../../model/patches';
import type { FramingDrawing } from '../../tools/framing-tool';
import type { InspectorEdit } from '../inspector-edits';
import type { InspectorView } from '../inspector-view';
import type { ResolveGapProps } from '../ResolveGap';
import { idKey } from '../../shared/ids';

export type InspectorContentProps = {
  view: InspectorView;
  canEdit: boolean;
  coarse: boolean;
  layersEditing: boolean;
  onToggleLayers: () => void;
  onCommit: (edits: readonly InspectorEdit[]) => MessageKey | null;
  onLayerMaterial: (index: number, material: WallLayer['material']) => MessageKey | null;
  lengthRef?: Ref<HTMLInputElement>;
  // EZD-213c D-Place: the Resolve the gap section, last in the wall view.
  gap?: ResolveGapProps | null;
};

/** What every kind is given: InspectorPanel's props and what its hooks worked out, read once per render. */
export type InspectorKindContext = {
  readonly store: ModelStore;
  readonly objects: Objects;
  /** The selection as the user made it (a room id included). */
  readonly selectedIds: readonly string[];
  /** The selection without rooms (EZD-218: the inspector never edits a room). */
  readonly ids: readonly string[];
  readonly canEdit: boolean;
  readonly projectId?: string;
  readonly fanClearance: number | null;
  readonly actMinShare: number;
  readonly surface?: SurfaceSetting;
  readonly framingDrawing?: FramingDrawing;
  /** EZD-514: the surface shown now ('floor' when the page has no surface setting). */
  readonly shownSurface: string;
  /** The key the wall, opening or bulk content is remounted by (the selection's ids). */
  readonly idsKey: string;
};

export type InspectorKind = {
  /** The branch's name in editor plan 2.5. */
  readonly id: string;
  /** Lower first: the order of InspectorPanel's branches before EZD-1915. */
  readonly order: number;
  /** The object this kind shows, or null when the selection is not this kind's. */
  readonly match: (ctx: InspectorKindContext) => string | null;
  /** The kind's panel, mounted by InspectorPanel for the object `match` named. */
  readonly Panel: (props: InspectorKindProps) => ReactElement;
};

/**
 * A kind's panel props. `content` (the wall, opening or bulk props, EZD-213b/c) holds the Length input's ref, so it
 * travels as a JSX prop and never through `match` (react-hooks/refs: no ref read during render).
 */
export type InspectorKindProps = {
  readonly ctx: InspectorKindContext;
  readonly id: string;
  readonly content: InspectorContentProps;
};

/** EZD-220, EZD-215: whether the id names an object of the type (ids compared by `idKey`). */
export function isType(objects: Objects, id: string, type: string): boolean {
  const key = idKey(id);
  for (const [k, v] of objects) if (idKey(k) === key) return v.type === type;
  return false;
}

/** The one selected object (rooms left out) when it is of the type, else null. */
export function aloneOfType(ctx: InspectorKindContext, type: string): string | null {
  return ctx.ids.length === 1 && isType(ctx.objects, ctx.ids[0]!, type) ? ctx.ids[0]! : null;
}
