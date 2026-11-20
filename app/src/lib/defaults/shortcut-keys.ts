// EZD-222 (S15d Keyboard shortcuts; 04 Tool rail "Default key"; 11 Budgets editor download size): the part of the
// company key map the editor needs on every key: the default keys, reading a key event, and the command it runs.
// The checks, the table's resets and the command names are in shortcuts.ts, which the editor does not load: the
// editor reads the effective value the server already checked (lib/defaults/values.ts effectiveValue).
//
// Keys are written 'W', 'Shift+L', '?', 'Mod+Shift+Z' ('Mod' is Ctrl, or Cmd on a Mac, shown "Ctrl" as board
// S15dDefaults writes it).

// 04 Tool rail table and "Other default keys"; S15d Reset to default map. In command order.
export const DEFAULT_KEYS = {
  select: 'V',
  move: 'M',
  wall: 'W',
  'room-rect': 'R',
  door: 'D',
  window: 'N',
  cabinets: 'C',
  countertops: 'K',
  fixtures: 'F',
  electrical: 'E',
  sketch: 'S',
  measure: 'Shift+L',
  help: '?',
  undo: 'Mod+Z',
  redo: 'Mod+Shift+Z',
  copy: 'Mod+C',
  paste: 'Mod+V',
} as const;

export type ShortcutId = string;
// Every command to its key in force ('' when cleared).
export type ShortcutBindings = Readonly<Record<string, string>>;

export const DEFAULT_BINDINGS: ShortcutBindings = Object.freeze({ ...DEFAULT_KEYS });

export type KeyEventLike = {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
};

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Meta', 'Alt', 'AltGraph', 'CapsLock', 'OS']);

// A key event as key text, or null when it cannot be a shortcut (a modifier alone, Alt, space, a named key).
export function keyOfEvent(e: KeyEventLike): string | null {
  if (MODIFIER_KEYS.has(e.key) || e.altKey) return null;
  if ([...e.key].length !== 1 || e.key.trim() === '') return null;
  const mod = e.ctrlKey || e.metaKey;
  const letter = /^[a-z]$/i.test(e.key);
  const base = letter ? e.key.toUpperCase() : e.key;
  // A shifted symbol ('?', '!') is its own key; Shift is kept for letters and with Mod.
  const shift = e.shiftKey && (letter || mod);
  return `${mod ? 'Mod+' : ''}${shift ? 'Shift+' : ''}${base}`;
}

// How a key reads in tooltips, the table and Help: board S15dDefaults writes "Ctrl+Z" ("Ctrl means Cmd on Mac").
export function keyLabel(key: string): string {
  return key.replace(/^Mod\+/, 'Ctrl+');
}

// The editor's map from the effective value (already checked by the server): its keys over the defaults.
export function bindingsOf(effective: unknown): ShortcutBindings {
  const own = typeof effective === 'object' && effective !== null && !Array.isArray(effective) ? effective : {};
  const out: Record<string, string> = { ...DEFAULT_KEYS };
  for (const id of Object.keys(DEFAULT_KEYS)) {
    const v = (own as Record<string, unknown>)[id];
    if (typeof v === 'string') out[id] = v;
  }
  return out;
}

const commandBound = (bindings: ShortcutBindings, key: string): string | null => {
  for (const id of Object.keys(DEFAULT_KEYS)) if (bindings[id] === key) return id;
  return null;
};

// The command a key event runs, or null. A shifted letter no command has runs the plain letter's command, as the
// tool keys always have (Shift+R is Room rectangle; Shift+L is Measure while L is free).
export function commandForKey(bindings: ShortcutBindings, e: KeyEventLike): string | null {
  const key = keyOfEvent(e);
  if (key === null) return null;
  const exact = commandBound(bindings, key);
  if (exact !== null) return exact;
  const m = /^Shift\+([A-Z])$/.exec(key);
  return m ? commandBound(bindings, m[1]) : null;
}
