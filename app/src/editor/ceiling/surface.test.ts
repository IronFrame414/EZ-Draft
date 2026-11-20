// EZD-502 (S05 Entry points; S05 Layout "Tool rail is the ceiling rail: Select, Ceiling type, Beam, Recessed light,
// Ceiling fan, Acoustical grid, HVAC diffuser or return, Smoke or CO detector, Speaker or low voltage, Access panel,
// Soffit/tray/coffer, Height and material tag"; S05 States "Locked / view-only ... Rail tools other than Select
// disabled"; S06 paused tools; board S05Ceiling rail). Pure; no DOM.
import { bindingsOf } from '../../lib/defaults/shortcut-keys';
import { describe, expect, it } from 'vitest';
import { editorRail } from '../selection/selection-controller';
import {
  CEILING_RAIL_TOOL,
  CEILING_TOOL_IDS,
  ceilingRail,
  createSurfaceSetting,
  isFloorToolKey,
  isSelectKey,
} from './surface';

const base = { editor: 'ready' as const, canvasFailed: false, controllerEnabled: true };
const SPEC_ORDER = [
  'select',
  '-',
  'ceiling-type',
  'beam',
  'recessed-light',
  'ceiling-fan',
  'act-grid',
  'hvac',
  'detector',
  'low-voltage',
  'access-panel',
  'soffit',
  'tag',
];

function railOf(o: Parameters<typeof editorRail>[0]) {
  const standard = editorRail(o)!;
  const select = standard.tools.find((t) => t.id === 'select')!;
  return ceilingRail(select, standard);
}

describe('EZD-502 ceiling rail', () => {
  it('lists the S05 tools in order after Select, with no sprinkler tool', () => {
    const rail = railOf({ ...base, canEdit: true });
    expect(rail.top.map((t) => (t.kind === 'tool' ? t.id : '-'))).toEqual(SPEC_ORDER);
    expect(rail.top.some((t) => t.kind === 'tool' && /sprinkler/.test(t.id))).toBe(false);
    expect(rail).toMatchObject({ disabled: false });
    expect(rail.only).toBeUndefined();
    expect(rail.paused).toBeUndefined();
  });

  it('the Ceiling tool is the roofing icon', () => {
    expect(CEILING_RAIL_TOOL).toMatchObject({
      id: 'ceiling',
      icon: 'roofing',
      label: 'office.tool.ceiling',
    });
  });

  it('without Edit model only Select is on (view only)', () => {
    const rail = railOf({ ...base, canEdit: false });
    expect(rail.only).toBe('select');
    expect(rail.top.map((t) => (t.kind === 'tool' ? t.id : '-'))).toEqual(SPEC_ORDER);
  });

  it('with Edit model but not the lock the ceiling tools are paused, Select is not', () => {
    const rail = railOf({ ...base, canEdit: false, canEditModel: true });
    expect(rail.paused).toEqual(CEILING_TOOL_IDS);
    expect(rail.paused).not.toContain('select');
  });

  it('while loading the rail is disabled', () => {
    expect(railOf({ ...base, editor: 'loading', canEdit: false }).disabled).toBe(true);
  });
});

describe('EZD-502 surface setting', () => {
  it('starts on Floor; a surface change ends the ceiling tool; Floor has no ceiling tool', () => {
    const s = createSurfaceSetting();
    const seen: string[] = [];
    s.subscribe(() => seen.push(`${s.get().surface}:${s.get().tool}`));
    expect(s.get()).toEqual({ surface: 'floor', tool: null });
    s.setTool('beam');
    expect(s.get().tool).toBeNull();
    s.setSurface('both');
    s.setTool('beam');
    s.setSurface('ceiling');
    s.setSurface('ceiling');
    expect(seen).toEqual(['both:null', 'both:beam', 'ceiling:null']);
  });
});

describe('EZD-502 floor tool keys', () => {
  const key = (k: string, mods: Partial<KeyboardEvent> = {}) =>
    ({
      key: k,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      defaultPrevented: false,
      target: null,
      ...mods,
    }) as never;

  it('W R D N M F S C and Shift+L are floor keys; V, Delete and Cmd+Z are not', () => {
    for (const k of ['w', 'r', 'd', 'n', 'm', 'f', 's', 'c', 'W'])
      expect(isFloorToolKey(key(k))).toBe(true);
    expect(isFloorToolKey(key('L', { shiftKey: true }))).toBe(true);
    expect(isFloorToolKey(key('v'))).toBe(false);
    expect(isFloorToolKey(key('Delete'))).toBe(false);
    expect(isFloorToolKey(key('z', { metaKey: true }))).toBe(false);
  });

  // EZD-222 (S15d Keyboard shortcuts; AC-EZD-222-1 scenario on the Ceiling view): with Wall moved to B, B is the
  // floor key and W is not; a moved Select key is the one that ends the ceiling tool.
  it('EZD-222 the floor keys and the Select key follow the company key map', () => {
    const wallB = bindingsOf({ wall: 'B' });
    expect(isFloorToolKey(key('b'), wallB)).toBe(true);
    expect(isFloorToolKey(key('w'), wallB)).toBe(false);
    expect(isFloorToolKey(key('r'), wallB)).toBe(true);
    expect(isFloorToolKey(key('?', { shiftKey: true }), wallB)).toBe(false);
    const selectJ = bindingsOf({ select: 'J' });
    expect(isSelectKey(key('j'), selectJ)).toBe(true);
    expect(isSelectKey(key('v'), selectJ)).toBe(false);
    expect(isFloorToolKey(key('j'), selectJ)).toBe(false);
    expect(isSelectKey(key('v'))).toBe(true);
  });
});
