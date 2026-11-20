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

// 04 Tool rail table order, the built tools only; default keys from 04 and S15d Reset to default map.
export const SHORTCUT_COMMANDS: readonly ShortcutCommand[] = [
  { id: 'select', label: 'office.tool.select', defaultKey: DEFAULT_KEYS['select'], views: EVERY_TAB },
  { id: 'move', label: 'office.tool.move', defaultKey: DEFAULT_KEYS['move'], views: PLAN_3D },
  { id: 'wall', label: 'office.tool.wall', defaultKey: DEFAULT_KEYS['wall'], views: PLAN_3D },
  { id: 'room-rect', label: 'office.tool.room_rect', defaultKey: DEFAULT_KEYS['room-rect'], views: PLAN_3D },
  { id: 'door', label: 'office.tool.door', defaultKey: DEFAULT_KEYS['door'], views: PLAN_3D },
  { id: 'window', label: 'office.tool.window', defaultKey: DEFAULT_KEYS['window'], views: PLAN_3D },
  { id: 'cabinets', label: 'office.tool.cabinets', defaultKey: DEFAULT_KEYS['cabinets'], views: PLAN_3D },
  { id: 'countertops', label: 'office.tool.countertops', defaultKey: DEFAULT_KEYS['countertops'], views: PLAN_3D },
  { id: 'fixtures', label: 'office.tool.fixtures', defaultKey: DEFAULT_KEYS['fixtures'], views: PLAN_3D },
  { id: 'electrical', label: 'office.tool.electrical', defaultKey: DEFAULT_KEYS['electrical'], views: PLAN_3D },
  { id: 'sketch', label: 'office.tool.sketch', defaultKey: DEFAULT_KEYS['sketch'], views: ['plan'] },
  { id: 'measure', label: 'office.tool.measure', defaultKey: DEFAULT_KEYS['measure'], views: EVERY_TAB },
  { id: 'help', label: 'office.tool.help', defaultKey: DEFAULT_KEYS['help'], views: EVERY_TAB },
  // 04 "Other default keys": Undo Ctrl/Cmd+Z, Redo Ctrl/Cmd+Shift+Z, Copy / Paste Ctrl/Cmd+C / V (S15d table rows).
  { id: 'undo', label: 'office.shortcuts.cmd.undo', defaultKey: DEFAULT_KEYS['undo'], views: EVERY_TAB },
  { id: 'redo', label: 'office.shortcuts.cmd.redo', defaultKey: DEFAULT_KEYS['redo'], views: EVERY_TAB },
  { id: 'copy', label: 'office.shortcuts.cmd.copy', defaultKey: DEFAULT_KEYS['copy'], views: EVERY_TAB },
  { id: 'paste', label: 'office.shortcuts.cmd.paste', defaultKey: DEFAULT_KEYS['paste'], views: EVERY_TAB },
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

// The key in force for every command: the stored change, else the default.
export function effectiveBindings(stored: unknown): ShortcutBindings {
  const own = isRecord(stored) && checkOverrides(stored) === null ? stored : {};
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
