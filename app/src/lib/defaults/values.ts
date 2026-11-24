// EZD-116 (Q-0697 decisions 03 "Defaults data"; 09o Value checks, Effective value, Copy at creation; Q-0561;
// Q-0706; S15d Validation): the value rules every Defaults reader and writer shares. Browser and server.
// Effective value = the stored value, else the registry default, else Not set (null). A project's own copy
// (project.settings.defaults) wins over the company value for the per-project keys.
import { formatLength, parseLength, LENGTH_REFUSED_MESSAGE_KEY } from '@ezdraft/geometry';
import type { MessageKey } from '../../server/messages/catalog';
import {
  DEFAULTS_REGISTRY,
  FIELD_RANGE_MAX_IN,
  PER_PROJECT_KEYS,
  defaultRow,
  type DefaultRow,
  type DefaultValue,
  type LengthRange,
  type ShortcutMap,
} from './registry';
import { checkOverrides, overridesOf, effectiveBindings, resolveOverrides } from './shortcuts';

export type StoredDefaults = Record<string, unknown>;
export type EffectiveDefaults = Record<string, DefaultValue | null>;

const MINUTES_MAX = 1440;
const DAYS_MAX = 365;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const sixteenth = (n: number) => Number.isInteger(n * 16);
const whole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

// Positive-only lengths: increments, wall sizes and the walk eye height cannot be 0, nor a row flagged positive
// (EZD-415: bracket spacing and seat width divide a side's length).
function lengthKind(row: DefaultRow): 'positive' | 'other' {
  return row.positive === true || row.group === 'increments' || row.group === 'walls' || row.group === 'three_d'
    ? 'positive'
    : 'other';
}

export type CheckResult = { ok: true } | { ok: false; messageKey: MessageKey };
const OK: CheckResult = { ok: true };
const refuse = (messageKey: MessageKey): CheckResult => ({ ok: false, messageKey });

export function refusalKey(row: DefaultRow): MessageKey {
  // EZD-134: a row with its own bounds names its own message.
  if (row.refusal) return row.refusal;
  switch (row.type) {
    case 'length':
    case 'length_choice':
      return row.type === 'length' ? LENGTH_REFUSED_MESSAGE_KEY : 'office.defaults.error.choice';
    case 'length_range':
      return 'office.defaults.error.range';
    case 'percent':
      return 'office.defaults.error.percent';
    case 'minutes':
      return 'office.defaults.error.minutes';
    case 'days':
      return row.zeroAllowed ? 'office.defaults.error.days_zero' : 'office.defaults.error.days';
    case 'count':
      return 'office.defaults.error.count';
    case 'shortcuts':
      return 'office.defaults.error.shortcuts';
    default:
      return 'office.defaults.error.choice';
  }
}

// One stored value, by the row's type (the save route's check; a stored value that fails it reads as unset).
export function checkValue(row: DefaultRow, v: unknown): CheckResult {
  const no = refuse(refusalKey(row));
  switch (row.type) {
    case 'length':
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || !sixteenth(v)) return no;
      if (lengthKind(row) === 'positive' && v <= 0) return no;
      return OK;
    case 'length_choice':
      return typeof v === 'number' && (row.lengths ?? []).includes(v) ? OK : no;
    case 'length_range': {
      if (!isObject(v)) return no;
      const { min, max } = v;
      if (Object.keys(v).length !== 2 || typeof min !== 'number' || typeof max !== 'number') return no;
      if (!sixteenth(min) || !sixteenth(max)) return no;
      return min >= 0 && min < max && max <= FIELD_RANGE_MAX_IN ? OK : no;
    }
    case 'percent':
      return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? OK : no;
    case 'minutes':
      return whole(v) && v >= 1 && v <= MINUTES_MAX ? OK : no;
    case 'days':
      return whole(v) && v >= (row.zeroAllowed ? 0 : 1) && v <= DAYS_MAX ? OK : no;
    case 'count':
      return whole(v) && v >= (row.min ?? 0) && v <= (row.max ?? Number.MAX_SAFE_INTEGER) ? OK : no;
    case 'choice':
      return typeof v === 'string' && (row.choices ?? []).includes(v) ? OK : no;
    case 'switch':
      return typeof v === 'boolean' ? OK : no;
    case 'scales':
      return Array.isArray(v) &&
        v.every((s) => typeof s === 'string' && (row.choices ?? []).includes(s)) &&
        new Set(v).size === v.length
        ? OK
        : no;
    // EZD-222: known commands, key text or '' (cleared), no browser key, no key shared in a view.
    case 'shortcuts':
      return checkOverrides(v) === null ? OK : no;
    default:
      return no;
  }
}

export function effectiveValue(key: string, stored: StoredDefaults | null | undefined): DefaultValue | null {
  const row = defaultRow(key);
  if (!row) return null;
  const v = stored?.[key];
  // EZD-230: a stored key map reads with the owner's keys over the defaults (shortcuts.ts resolveOverrides).
  if (row.type === 'shortcuts') {
    const own = v === undefined || v === null ? null : resolveOverrides(v);
    return own === null ? row.default : (own as DefaultValue);
  }
  if (v !== undefined && v !== null && checkValue(row, v).ok) return v as DefaultValue;
  return row.default;
}

// Every registry key (fixed rows excluded) to its effective value. `project` is project.settings.defaults:
// its per-project keys win; a key it lacks reads the company value live (Q-0697 03).
export function effectiveDefaults(
  stored: StoredDefaults | null | undefined,
  project?: StoredDefaults | null,
): EffectiveDefaults {
  const out: EffectiveDefaults = {};
  for (const row of DEFAULTS_REGISTRY) {
    if (row.type === 'fixed') continue;
    const own = row.perProject ? project?.[row.key] : undefined;
    out[row.key] =
      own !== undefined && own !== null && checkValue(row, own).ok
        ? (own as DefaultValue)
        : effectiveValue(row.key, stored);
  }
  return out;
}

// The copy a new project keeps (S15d Decision 4; 09o Copy at creation): the per-project keys with a value;
// a key Not set at creation is left out and reads the company value live.
export function projectDefaultsCopy(stored: StoredDefaults | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of PER_PROJECT_KEYS) {
    const v = effectiveValue(key, stored);
    if (typeof v === 'number') out[key] = v;
  }
  return out;
}

// Rules between two values (S15d:62; Q-0706), on effective values; the error sits on the dependent row.
export function crossCheck(eff: EffectiveDefaults): Record<string, MessageKey> {
  const errors: Record<string, MessageKey> = {};
  const limit = eff.seating_support_limit;
  const standard = eff.overhang_standard;
  if (typeof limit === 'number' && typeof standard === 'number' && !(limit > standard)) {
    errors.seating_support_limit = 'office.defaults.error.seating_limit';
  }
  const lead = eff.share_link_reminder_lead;
  const expiry = eff.share_link_expiry;
  if (typeof lead === 'number' && typeof expiry === 'number' && !(lead < expiry)) {
    errors.share_link_reminder_lead = 'office.defaults.error.reminder_lead';
  }
  return errors;
}

export type Changes = Record<string, DefaultValue | null>;

// The stored object after a save: a null removes the key (assumption Q-0714 (a)).
export function applyChanges(stored: StoredDefaults, changes: Changes): StoredDefaults {
  const next: StoredDefaults = { ...stored };
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  return next;
}

// ---- Form text (the page's inputs) ----

export type FormValue = string | boolean | readonly string[] | { min: string; max: string } | ShortcutMap;

const fmtLen = (n: number) => formatLength(n, 16);

export function formValueOf(row: DefaultRow, v: DefaultValue | null): FormValue {
  switch (row.type) {
    case 'length':
    case 'length_choice':
      return typeof v === 'number' ? fmtLen(v) : '';
    case 'length_range': {
      const r = v as LengthRange | null;
      return r ? { min: fmtLen(r.min), max: fmtLen(r.max) } : { min: '', max: '' };
    }
    case 'switch':
      return v === true;
    case 'scales':
      return Array.isArray(v) ? (v as readonly string[]) : [];
    case 'choice':
      return typeof v === 'string' ? v : '';
    // EZD-222: the changes, in command order.
    case 'shortcuts':
      return overridesOf(effectiveBindings(v));
    default:
      return v === null || v === undefined ? '' : String(v);
  }
}

export type ParseResult = { ok: true; value: DefaultValue | null } | { ok: false; messageKey: MessageKey };

function parseWhole(text: string): number | null {
  const s = text.trim().replace(/,/g, '');
  return /^\d+$/.test(s) ? Number(s) : null;
}

function parseLen(row: DefaultRow, text: string): number | null {
  const r = parseLength(text, lengthKind(row));
  return r.ok ? r.inches : null;
}

// A form value to the value saved; '' (or an empty range) is null, which removes the key.
export function parseFormValue(row: DefaultRow, f: FormValue): ParseResult {
  const no: ParseResult = { ok: false, messageKey: refusalKey(row) };
  const done = (value: DefaultValue | null): ParseResult =>
    value === null || checkValue(row, value).ok ? { ok: true, value } : no;
  if (row.type === 'length_range') {
    const { min, max } = f as { min: string; max: string };
    if (min.trim() === '' && max.trim() === '') return { ok: true, value: null };
    const lo = parseLen(row, min);
    const hi = parseLen(row, max);
    return lo === null || hi === null ? no : done({ min: lo, max: hi });
  }
  if (row.type === 'switch') return done(f === true);
  if (row.type === 'scales') return done(f as readonly string[]);
  // EZD-222: no changes left is the default map, so the key is removed.
  if (row.type === 'shortcuts') {
    const map = f as ShortcutMap;
    return Object.keys(map).length === 0 ? { ok: true, value: null } : done(map);
  }
  if (typeof f !== 'string') return no;
  if (f.trim() === '') return { ok: true, value: null };
  switch (row.type) {
    case 'length':
    case 'length_choice': {
      const r = parseLength(f, lengthKind(row));
      if (!r.ok) return { ok: false, messageKey: row.type === 'length' ? r.messageKey : no.messageKey };
      return done(r.inches);
    }
    case 'percent': {
      const s = f.trim().replace(/%$/, '').trim();
      if (!/^\d+(?:\.\d+)?$/.test(s)) return no;
      return done(Number(s));
    }
    case 'minutes':
    case 'days':
    case 'count': {
      const n = parseWhole(f);
      return n === null ? no : done(n);
    }
    case 'choice':
      return done(f);
    default:
      return no;
  }
}
