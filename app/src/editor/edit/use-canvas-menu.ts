// EZD-1914 (editor plan 5.2): moved unchanged out of ProjectEditor.
// EZD-233 (S03 Context menu; Inspector More; vault/build/assumptions.md EZD-233): for an editor, a right-click or long
// press on the plan with no drawing tool on opens the context menu (an object under it that is not selected is
// selected first, with its group); the inspector footer's More opens the More menu.
import { useCallback, useEffect, useState } from 'react';
import type { EditMenuRequest } from '../../lazy/edit-menu';
import type { EditorSession } from '../editor-session';
import { expandGroups } from '../selection/groups';
import type { EditorControllers } from '../session/create-controllers';

export type CanvasMenuDeps = {
  readonly plan: EditorControllers['plan'] | null;
  readonly selection: EditorControllers['selection'] | null;
  readonly drawing: EditorControllers['drawing'] | null;
  readonly session: EditorSession | null;
  readonly canEdit: boolean;
  /** EZD-5605 (vault/build/assumptions.md): no edit menu while the tools are limited. */
  readonly limited: boolean;
};

export function useCanvasMenu({
  plan,
  selection,
  drawing,
  session,
  canEdit,
  limited,
}: CanvasMenuDeps) {
  const [menu, setMenu] = useState<EditMenuRequest | null>(null);
  useEffect(() => {
    if (plan === null || selection === null || drawing === null || session === null) return;
    if (!canEdit) return;
    return plan.handle.onContextMenu((screen, client) => {
      if (drawing.getUi().tool !== null) return false;
      if (limited) return true;
      const hit = selection.pickAt(plan.handle.screenToModel(screen))[0];
      if (hit !== undefined) {
        const lower = hit.toLowerCase();
        if (!selection.getUi().ids.some((id) => id.toLowerCase() === lower))
          selection.select(expandGroups(session.store.getState().objects, [hit]));
      }
      setMenu({ kind: 'canvas', at: client });
      return true;
    });
  }, [plan, selection, drawing, session, canEdit, limited]);
  const closeMenu = useCallback(() => setMenu(null), []);
  return { menu, setMenu, closeMenu };
}
