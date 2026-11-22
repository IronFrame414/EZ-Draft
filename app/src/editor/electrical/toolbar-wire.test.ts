// EZD-602 (S06 Device toolbar "Edit model ... Paused in view only"; ceiling-device-tool.ts one wire for the shared
// route): on the floor plan the one wire routes the device toolbar's receiver while an item is armed and editing is
// allowed, and routes the ceiling tools as before on the ceiling.
import { describe, expect, it } from 'vitest';
import { createSurfaceSetting } from '../ceiling/surface';
import type { PlanPointerReceiver } from '../plan/input';
import { wireCeilingTools } from '../tools/ceiling-device-tool';
import { createElectricalToolbar } from './toolbar-state';

describe('EZD-602 device toolbar route', () => {
  const setup = (mayEdit: boolean) => {
    const surface = createSurfaceSetting();
    const toolbar = createElectricalToolbar();
    const place: PlanPointerReceiver = () => {};
    const light: PlanPointerReceiver = () => {};
    const routed: Array<PlanPointerReceiver | null> = [];
    const off = wireCeilingTools(
      surface,
      (r) => routed.push(r),
      { 'recessed-light': light },
      mayEdit,
      {
        getState: () => ({ tool: toolbar.get().armed === null ? null : place }),
        subscribe: toolbar.subscribe,
      },
    );
    return { surface, toolbar, place, light, routed, off, last: () => routed[routed.length - 1] };
  };

  it('routes the armed item on the floor, none when disarmed, the ceiling tool on the ceiling', () => {
    const s = setup(true);
    expect(s.last()).toBeNull();
    s.toolbar.press('receptacle');
    expect(s.last()).toBe(s.place);
    s.toolbar.press('receptacle');
    expect(s.last()).toBeNull();
    s.toolbar.press('switch');
    s.surface.setSurface('ceiling');
    s.surface.setTool('recessed-light');
    expect(s.last()).toBe(s.light);
    s.surface.setSurface('floor');
    expect(s.last()).toBe(s.place);
    s.off();
    expect(s.last()).toBeNull();
  });

  it('view only routes nothing', () => {
    const s = setup(false);
    s.toolbar.press('receptacle');
    expect(s.routed.every((r) => r === null)).toBe(true);
    s.off();
  });
});
