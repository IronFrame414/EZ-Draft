'use client';
// EZD-602 (S06 Controls Device toolbar rows, "Canvas right-click | Context menu: assign to circuit, set GFCI/AFCI,
// delete. | Edit model."; 11 Budgets; vault/build/assumptions.md EZD-602): electrical mode's device tools, loaded with
// its lazy module. It holds the toolbar's state while electrical mode is open, puts the armed item's receiver in the
// editor's slot (none while paused), and opens the device menu on a right-click or long-press over a device. The
// store and the other things a placing tool is given come from the slot's `base`.
// EZD-604: the Circuit item arms the Circuit tool (circuit-tool.ts) instead of a placing receiver.
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactElement } from 'react';
import type { Point } from '@ezdraft/geometry';
import { circuitToolReceiver } from './circuit-tool';
import { circuitView } from './circuit-view';
import { deviceMenuAt, toolbarDeviceReceiver, type ToolbarReceiverDeps } from './device-toolbar';
import { DeviceMenu, type DeviceMenuRequest } from './DeviceMenu';
import { DeviceToolbar } from './DeviceToolbar';
import type { ReceiverSlot } from './receiver-slot';
import { CIRCUIT_TOOL } from './toolbar-items';
import { createElectricalToolbar } from './toolbar-state';

export type ToolBase = Omit<ToolbarReceiverDeps, 'toolbar'>;

export type DeviceToolsProps = {
  slot: ReceiverSlot<ToolBase>;
  paused: boolean;
  handle: {
    onContextMenu(listener: (screen: Point, client: Point) => boolean): () => void;
    screenToModel(p: Point): Point;
  };
  selection: Parameters<typeof deviceMenuAt>[1];
};

export function DeviceTools({ slot, paused, handle, selection }: DeviceToolsProps): ReactElement {
  const [toolbar] = useState(createElectricalToolbar);
  // EZD-604: 'circuit' is the Circuit tool; any other armed item places devices.
  const readArmed = () => {
    const a = toolbar.get().armed;
    return a === null ? 'none' : a === CIRCUIT_TOOL ? 'circuit' : 'device';
  };
  const armed = useSyncExternalStore(toolbar.subscribe, readArmed, () => 'none' as const);
  const readBase = () => slot.getState().base;
  const base = useSyncExternalStore(slot.subscribe, readBase, readBase);
  const [menu, setMenu] = useState<DeviceMenuRequest | null>(null);
  const close = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (paused || armed === 'none' || base === null) return;
    slot.setState({
      tool:
        armed === 'circuit'
          ? circuitToolReceiver({
              store: base.store,
              pickAt: (p) => selection.pickAt(p),
              circuit: () => circuitView.get().circuit,
              select: base.select,
              onMessage: base.onMessage,
            })
          : toolbarDeviceReceiver({ ...base, toolbar }),
    });
    return () => slot.setState({ tool: null });
  }, [paused, armed, base, slot, toolbar, selection]);

  useEffect(() => {
    if (paused || base === null) return;
    return handle.onContextMenu((screen, client) => {
      const req = deviceMenuAt(
        base.store.getState().objects,
        selection,
        handle.screenToModel(screen),
        client,
      );
      if (req === null) return false;
      setMenu(req);
      return true;
    });
  }, [paused, handle, base, selection]);

  return (
    <>
      <DeviceToolbar toolbar={toolbar} paused={paused} />
      {menu !== null && !paused && base !== null ? (
        <DeviceMenu request={menu} store={base.store} onClose={close} onMessage={base.onMessage} />
      ) : null}
    </>
  );
}
