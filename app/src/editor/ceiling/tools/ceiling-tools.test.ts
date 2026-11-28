// EZD-1914 (AC-EZD-1914-1; S05 Controls; editor plan 5.2 job 3): every ceiling tool registers its own click receiver
// in ceiling/tools, and a click before the tool's lazy module arrives is still placed once it has. The tool list is
// S05 Controls: Beam, each ceiling device (Recessed light, Ceiling fan, Smoke or CO detector, Speaker or low voltage,
// Access panel), Switching zones, Soffit, tray, coffer, Height and material tag, Acoustical grid, and the framing line
// of the inspector's Framing known section (EZD-514).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlanPointerEvent, PlanPointerReceiver } from '../../plan/input';
import { CEILING_DEVICE_TOOL_IDS } from '../../tools/ceiling-device-tool';
import { ceilingTools } from './index.generated';
import { ceilingReceivers, lazyReceiver, type CeilingToolWiring } from './types';

const click = { kind: 'click' } as unknown as PlanPointerEvent;
const move = { kind: 'move' } as unknown as PlanPointerEvent;

function fakeModule<M>(mod: M) {
  let value: M | undefined;
  let resolve: (() => void) | null = null;
  const load = vi.fn(
    () =>
      new Promise<M>((r) => {
        resolve = () => {
          value = mod;
          r(mod);
        };
      }),
  );
  return { peek: () => value, load, arrive: () => resolve?.() };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const wiring = {
  base: { tag: 'base' },
  surface: { get: () => ({}), subscribe: () => () => {} },
  deviceChoice: { tag: 'choice' },
  actMinShare: () => 0.5,
} as unknown as CeilingToolWiring;

afterEach(() => vi.restoreAllMocks());

describe('EZD-1914 AC-EZD-1914-1 ceiling tools register their own receivers', () => {
  it('lists Beam, each ceiling device, Switching zones, Soffit, Tag, ACT grid and the framing line, each once', () => {
    const ids = ceilingTools.flatMap((t) => t.tools);
    expect([...ids].sort()).toEqual(
      [
        'beam',
        ...CEILING_DEVICE_TOOL_IDS,
        'switch-zone',
        'soffit',
        'tag',
        'act-grid',
        'framing-line',
      ].sort(),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('wires every listed tool id to a receiver', () => {
    const receivers = ceilingReceivers(ceilingTools, wiring, () => true);
    for (const id of ceilingTools.flatMap((t) => t.tools))
      expect(typeof receivers[id]).toBe('function');
  });
});

describe('EZD-1914 AC-EZD-1914-1 a click before the lazy module arrives is placed once it has', () => {
  it('loads the module on a click and places that click once, after it arrives', async () => {
    const got: PlanPointerEvent[] = [];
    const mod = fakeModule({ receiver: ((e) => void got.push(e)) as PlanPointerReceiver });
    const r = lazyReceiver(
      mod,
      (m) => m.receiver,
      false,
      () => true,
    );
    r(click);
    expect(mod.load).toHaveBeenCalledTimes(1);
    expect(got).toEqual([]);
    mod.arrive();
    await flush();
    expect(got).toEqual([click]);
    // Once in, the next click is placed at once.
    r(click);
    expect(got).toEqual([click, click]);
  });

  it('drops a move before the module arrives, and places nothing once the tools are unwired', async () => {
    const got: PlanPointerEvent[] = [];
    const mod = fakeModule({ receiver: ((e) => void got.push(e)) as PlanPointerReceiver });
    let live = true;
    const r = lazyReceiver(
      mod,
      (m) => m.receiver,
      false,
      () => live,
    );
    r(move);
    expect(mod.load).not.toHaveBeenCalled();
    r(click);
    live = false;
    mod.arrive();
    await flush();
    expect(got).toEqual([]);
  });

  it('a kept receiver is made once for the wiring, so a tool drawn over several clicks keeps its state', async () => {
    const make = vi.fn((m: { receiver: PlanPointerReceiver }) => m.receiver);
    const mod = fakeModule({ receiver: (() => {}) as PlanPointerReceiver });
    const r = lazyReceiver(mod, make, true, () => true);
    r(click);
    r(click);
    mod.arrive();
    await flush();
    r(click);
    expect(make).toHaveBeenCalledTimes(1);
  });

  it('holds for every registered tool: its click waits for its own module and reaches its receiver', async () => {
    for (const t of ceilingTools) {
      for (const id of t.tools) {
        const got: string[] = [];
        const placed: PlanPointerReceiver = () => void got.push(id);
        // Every placement function a tool may call on its module, each giving the receiver that records the click.
        const stub = {
          beamReceiver: vi.fn(() => placed),
          deviceReceiver: vi.fn(() => placed),
          zoneReceiver: vi.fn(() => placed),
          framingReceiver: vi.fn(() => placed),
          shapeReceiver: vi.fn(() => placed),
          tagReceiver: vi.fn(() => placed),
          actReceiver: vi.fn(() => placed),
        };
        let arrive: () => void = () => {};
        let inModule = false;
        vi.spyOn(t.module, 'peek').mockImplementation(() => (inModule ? stub : undefined));
        const load = vi.spyOn(t.module, 'load').mockImplementation(
          () =>
            new Promise((r) => {
              arrive = () => {
                inModule = true;
                r(stub);
              };
            }),
        );
        const receivers = ceilingReceivers([t], wiring, () => true);
        receivers[id]!(click);
        expect(load, id).toHaveBeenCalledTimes(1);
        expect(got, id).toEqual([]);
        arrive();
        await flush();
        expect(got, id).toEqual([id]);
        vi.restoreAllMocks();
      }
    }
  });

  it('gives each device tool its own id, the page choice and the ACT minimum border', async () => {
    const devices = ceilingTools.find((t) => t.tools.includes('recessed-light'))!;
    const deviceReceiver = vi.fn(() => (() => {}) as PlanPointerReceiver);
    vi.spyOn(devices.module, 'peek').mockReturnValue({ deviceReceiver });
    const receivers = ceilingReceivers([devices], wiring, () => true);
    for (const id of CEILING_DEVICE_TOOL_IDS) receivers[id]!(click);
    expect(deviceReceiver.mock.calls.map((c) => (c as unknown[])[0])).toEqual(
      CEILING_DEVICE_TOOL_IDS.map((tool) =>
        expect.objectContaining({
          tag: 'base',
          tool,
          choice: wiring.deviceChoice,
          actMinShare: wiring.actMinShare,
        }),
      ),
    );
  });
});
