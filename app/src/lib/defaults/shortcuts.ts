// EZD-222 (S15d Keyboard shortcuts table, Reset to default map, Reset shortcut (row); 04 Tool rail "Default key"
// and "Shown on"; S03 Help; phase-02.md EZD-222 "Already used by check, browser keys refused; rail and tooltips
// read bindings; Help lists shortcuts"): the company key map. Browser and server, no DOM.
//
// Stored in tenant.defaults.keyboard_shortcuts as the owner's changes only: { <command>: <key> }, where '' means
// the row was cleared (Reset shortcut) and a missing command uses its default key. Reset to default map removes
// the cleared rows whose default key is free, so it never overwrites a key already set.
//
// Key text, reading key events and the default keys are in shortcut-keys.ts (the editor's part). The commands are
// the ones built so far; each later command's ticket adds its row (vault/build/assumptions.md EZD-222).
import type { MessageKey } from '../../server/messages/catalog';
import {
  DEFAULT_BINDINGS,
  DEFAULT_KEYS,
  type ShortcutBindings,
} from './shortcut-keys';

export {
  DEFAULT_BINDINGS,
  bindingsOf,
  commandForKey,
  keyLabel,
  keyOfEvent,
  type KeyEventLike,
  type ShortcutBindings,
  type ShortcutId,
} from './shortcut-keys';

export type ShortcutView = 'plan' | '3d' | 'sheets' | 'render';
const EVERY_TAB: readonly ShortcutView[] = ['plan', '3d', 'sheets', 'render'];
// 04 "Plan, 3D (switches to Plan)".
const PLAN_3D: readonly ShortcutView[] = ['plan', '3d'];

export type ShortcutCommand = {
  id: string;
  label: MessageKey;
  defaultKey: string;
  views: readonly ShortcutView[];
};

// 04 Tool rail table order; default keys from 04 and S15d Reset to default map.
// EZD-230 (phase-02.md EZD-230 "all tools, Shown on per tab"): every rail tool of the 04 table, then the S15d default
// map's Pan, Look up, tabs 1 to 4 and Save. A tool whose feature is not built yet has its row and key here but no
// rail button. Walk movement, Mirror and Align have no default key in S15d and get their rows from EZD-1003 and
// EZD-233 (vault/build/assumptions.md EZD-230).
const cmd = (
  id: keyof typeof DEFAULT_KEYS,
  label: MessageKey,
  views: readonly ShortcutView[],
): ShortcutCommand => ({
  id,
  label,
  defaultKey: DEFAULT_KEYS[id],
  views,
});
// 04 "Plan, 3D, Render"; "Plan, Sheets"; "Plan".
const CATALOG_VIEWS: readonly ShortcutView[] = ['plan', '3d', 'render'];
const PLAN_SHEETS: readonly ShortcutView[] = ['plan', 'sheets'];
const PLAN: readonly ShortcutView[] = ['plan'];
export const SHORTCUT_COMMANDS: readonly ShortcutCommand[] = [
  cmd('select', 'office.tool.select', EVERY_TAB),
  cmd('move', 'office.tool.move', PLAN_3D),
  cmd('wall', 'office.tool.wall', PLAN_3D),
  cmd('room-rect', 'office.tool.room_rect', PLAN_3D),
  cmd('door', 'office.tool.door', PLAN_3D),
  cmd('window', 'office.tool.window', PLAN_3D),
  cmd('cabinets', 'office.tool.cabinets', PLAN_3D),
  cmd('countertops', 'office.tool.countertops', PLAN_3D),
  cmd('fixtures', 'office.tool.fixtures', PLAN_3D),
  cmd('electrical', 'office.tool.electrical', PLAN_3D),
  cmd('ceiling', 'office.tool.ceiling', PLAN_3D),
  cmd('catalog', 'office.tool.catalog', CATALOG_VIEWS),
  cmd('dimension', 'office.tool.dimension', PLAN_3D),
  cmd('text', 'office.tool.text', PLAN_SHEETS),
  cmd('sketch', 'office.tool.sketch', PLAN),
  cmd('detail-callout', 'office.tool.detail_callout', PLAN_SHEETS),
  cmd('revision-cloud', 'office.tool.revision_cloud', PLAN_SHEETS),
  // 04 "Plan" and "Plan (reference mode)": both on the Plan tab.
  cmd('reference', 'office.tool.reference', PLAN),
  cmd('markup', 'office.tool.markup', PLAN),
  cmd('supplier-markup', 'office.tool.supplier_markup', PLAN),
  cmd('measure', 'office.tool.measure', EVERY_TAB),
  cmd('check', 'office.tool.check', EVERY_TAB),
  cmd('help', 'office.tool.help', EVERY_TAB),
  // 04 Other default keys: Pan H (Sheets), Look up U (3D), the tabs 1 to 4 (every tab).
  cmd('pan', 'office.shortcuts.cmd.pan', ['sheets']),
  cmd('look-up', 'office.shortcuts.cmd.look_up', ['3d']),
  cmd('tab-plan', 'office.shortcuts.cmd.tab_plan', EVERY_TAB),
  cmd('tab-3d', 'office.shortcuts.cmd.tab_3d', EVERY_TAB),
  cmd('tab-sheets', 'office.shortcuts.cmd.tab_sheets', EVERY_TAB),
  cmd('tab-render', 'office.shortcuts.cmd.tab_render', EVERY_TAB),
  // 04 Other default keys: Undo Ctrl/Cmd+Z, Redo Ctrl/Cmd+Shift+Z, Copy / Paste Ctrl/Cmd+C / V, Save Ctrl/Cmd+S.
  cmd('undo', 'office.shortcuts.cmd.undo', EVERY_TAB),
  cmd('redo', 'office.shortcuts.cmd.redo', EVERY_TAB),
  cmd('copy', 'office.shortcuts.cmd.copy', EVERY_TAB),
  cmd('paste', 'office.shortcuts.cmd.paste', EVERY_TAB),
  cmd('save', 'office.shortcuts.cmd.save', EVERY_TAB),
];

// What is stored: the owner's changes only.
export type ShortcutOverrides = Readonly<Record<string, string>>;

const BY_ID = new Map(SHORTCUT_COMMANDS.map((c) => [c.id, c]));

export function shortcutCommand(id: string): ShortcutCommand | undefined {
  return BY_ID.get(id);
}

// Keys the browser keeps for itself (close, new or reopen a tab or window, reload, address bar, print, find,
// history, downloads, bookmarks, open file, quit, hide, minimize): a page cannot rely on them
// (vault/build/assumptions.md EZD-222).
const BROWSER_KEYS = new Set([
  'Mod+W',
  'Mod+T',
  'Mod+N',
  'Mod+Q',
  'Mod+R',
  'Mod+L',
  'Mod+P',
  'Mod+F',
  'Mod+H',
  'Mod+J',
  'Mod+D',
  'Mod+O',
  'Mod+M',
  'Mod+Shift+T',
  'Mod+Shift+N',
  'Mod+Shift+W',
  'Mod+Shift+Q',
  'Mod+Shift+R',
  'Mod+Shift+J',
  'Mod+Shift+Delete',
]);

export function isBrowserKey(key: string): boolean {
  return BROWSER_KEYS.has(key);
}

// One printable character other than space; a letter is upper case and may carry Shift; Mod comes first.
const KEY_PATTERN = /^(Mod\+)?(Shift\+)?([A-Z]|[^\sA-Za-z])$/u;

export function isKeyText(key: string): boolean {
  const m = KEY_PATTERN.exec(key);
  if (!m) return false;
  // Shift is written only on a letter or with Mod; '?' already is the shifted key.
  if (m[2] && !m[1] && !/[A-Z]/.test(m[3])) return false;
  return [...m[3]].length === 1;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// The key in force for every command: the stored change, else the default (resolveOverrides).
export function effectiveBindings(stored: unknown): ShortcutBindings {
  const own = resolveOverrides(stored) ?? {};
  const out: Record<string, string> = {};
  for (const c of SHORTCUT_COMMANDS) {
    const v = own[c.id];
    out[c.id] = typeof v === 'string' ? v : c.defaultKey;
  }
  return out;
}

const shareView = (a: ShortcutCommand, b: ShortcutCommand) => a.views.some((v) => b.views.includes(v));

// The command already using `key` in a view `id` is shown on, or null.
export function usedBy(bindings: ShortcutBindings, id: string, key: string): ShortcutCommand | null {
  const me = BY_ID.get(id);
  if (!me || key === '') return null;
  for (const c of SHORTCUT_COMMANDS) {
    if (c.id !== id && bindings[c.id] === key && shareView(me, c)) return c;
  }
  return null;
}

export const SHORTCUT_VIEWS: readonly ShortcutView[] = EVERY_TAB;

// The first view two commands share (board S15dDefaults "Already used by Wall in Plan"), or null.
export function sharedView(a: string, b: string): ShortcutView | null {
  const x = BY_ID.get(a);
  const y = BY_ID.get(b);
  if (!x || !y) return null;
  return SHORTCUT_VIEWS.find((v) => x.views.includes(v) && y.views.includes(v)) ?? null;
}

export type ShortcutRefusal = 'browser' | 'used' | 'invalid';

// Why `key` cannot be given to `id`, or null when it can.
export function refuseKey(bindings: ShortcutBindings, id: string, key: string): ShortcutRefusal | null {
  if (!BY_ID.has(id) || !isKeyText(key)) return 'invalid';
  if (isBrowserKey(key)) return 'browser';
  return usedBy(bindings, id, key) ? 'used' : null;
}

// The stored value's check: known commands, key text or '', no browser key, no two commands sharing a key in a view.
export function checkOverrides(v: unknown): ShortcutRefusal | null {
  if (!isRecord(v)) return 'invalid';
  for (const [id, key] of Object.entries(v)) {
    if (!BY_ID.has(id) || typeof key !== 'string') return 'invalid';
    if (key !== '' && !isKeyText(key)) return 'invalid';
    if (isBrowserKey(key)) return 'browser';
  }
  const bindings: Record<string, string> = { ...DEFAULT_BINDINGS, ...(v as Record<string, string>) };
  for (const c of SHORTCUT_COMMANDS) {
    if (usedBy(bindings, c.id, bindings[c.id])) return 'used';
  }
  return null;
}

// The overrides that give `bindings`: only the keys that differ from the default, in command order.
export function overridesOf(bindings: ShortcutBindings): ShortcutOverrides {
  const out: Record<string, string> = {};
  for (const c of SHORTCUT_COMMANDS) {
    const k = bindings[c.id] ?? c.defaultKey;
    if (k !== c.defaultKey) out[c.id] = k;
  }
  return out;
}

// S15d Reset to default map: fills the empty rows with their default key; a key already set is never changed, and
// a default key another command now uses in the same view leaves that row empty.
export function resetToDefaultMap(bindings: ShortcutBindings): ShortcutBindings {
  const out: Record<string, string> = { ...bindings };
  for (const c of SHORTCUT_COMMANDS) {
    if ((out[c.id] ?? '') !== '') continue;
    if (usedBy(out, c.id, c.defaultKey) === null) out[c.id] = c.defaultKey;
  }
  return out;
}

// EZD-230 (S15d Reset to default map "Never overwrites a key already set"; vault/build/assumptions.md EZD-222, the
// open clash): how a stored map reads. A key the owner set wins over a default key: a command still on its default
// whose key a set key uses in a shared view reads as cleared (''), "Not set", as when a later ticket adds a command
// whose default key the owner already gave to another. The map reads as the default map ({}, null here) only when
// it is not a map, names no known command, holds bad or browser keys, or two set keys clash. Saving stays strict
// (checkOverrides), so the owner's next save stores the cleared row.
export function resolveOverrides(v: unknown): ShortcutOverrides | null {
  if (!isRecord(v)) return null;
  const set: Record<string, string> = {};
  for (const [id, key] of Object.entries(v)) {
    if (!BY_ID.has(id) || typeof key !== 'string') return null;
    if (key !== '' && !isKeyText(key)) return null;
    if (isBrowserKey(key)) return null;
    set[id] = key;
  }
  for (const id of Object.keys(set)) {
    const me = BY_ID.get(id)!;
    for (const other of Object.keys(set)) {
      if (
        other !== id &&
        set[id] !== '' &&
        set[other] === set[id] &&
        shareView(me, BY_ID.get(other)!)
      )
        return null;
    }
  }
  const out: Record<string, string> = { ...set };
  for (const c of SHORTCUT_COMMANDS) {
    if (c.id in set) continue;
    const taken = Object.keys(set).some(
      (id) => set[id] === c.defaultKey && shareView(c, BY_ID.get(id)!),
    );
    if (taken) out[c.id] = '';
  }
  return out;
}
