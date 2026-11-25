'use client';
// EZD-502 (S05 Layout "legend chip bottom left"; S05 Controls "Legend chip: shows switch zone line style"; S05 Layout
// "Status bar adds View, Scale and Joists status"; S05 States "Joists unknown"; board S05Ceiling footer "View Reflected
// ceiling plan", "Joists unknown · beam clash checks off"): the parts the editor shows on Ceiling or Both. The ACT
// border sizes join the legend with the ACT grid (EZD-511); the joist text changes with Framing known (EZD-514).
// EZD-508: the legend and the status items moved to CeilingShown.tsx, which loads with the RCP drawing; the keys stay.
import { useEffect, useRef } from 'react';
import { isFloorToolKey, isSelectKey, type SurfaceSetting } from './surface';
import type { ShortcutBindings } from '../../lib/defaults/shortcut-keys';

// On Ceiling or Both the standard tools' keys are swallowed before the plan's key handlers see them; the Select key
// and Esc end the ceiling tool (Select). EZD-222: the keys are the company's (`keys`), read on every key.
export function useCeilingKeys(
  setting: SurfaceSetting | null,
  onSelect: () => void,
  keys?: () => ShortcutBindings,
): void {
  const keysRef = useRef(keys);
  useEffect(() => {
    keysRef.current = keys;
  });
  useEffect(() => {
    if (setting === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (setting.get().surface === 'floor') return;
      const bindings = keysRef.current?.();
      if (isFloorToolKey(e, bindings)) {
        e.stopImmediatePropagation();
        return;
      }
      if (e.defaultPrevented || setting.get().tool === null) return;
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
      if ((plain && e.key === 'Escape') || isSelectKey(e, bindings)) {
        setting.setTool(null);
        onSelect();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [setting, onSelect]);
}
