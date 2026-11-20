// EZD-712 (S15c; 03c submittal_profile; 08 Department submittal rules): submittal profiles as the app sees them,
// the request bodies of /api/settings/sheet-presets and the naming pattern check. Browser and server. The value
// lists match the table checks in 20261119140000_create_submittal_profile.sql (profiles-sql.test.ts).
import type { MessageKey } from '../../server/messages/catalog';

export const SUBMITTAL_TYPES = ['electronic', 'paper'] as const;
export type SubmittalType = (typeof SUBMITTAL_TYPES)[number];

// S15c Electrical signature requirement: None, Electrical contractor, Architect (03c also lists engineer, which
// the table allows; the screen offers the S15c three).
export const SIGNERS = ['none', 'electrical_contractor', 'architect'] as const;
export type Signer = (typeof SIGNERS)[number] | 'engineer';

// S15c Stamp box: default 3" x 3" bottom right above the title block; Fort Lauderdale 6" x 2" top left.
export const STAMP_POSITIONS = ['bottom_right', 'bottom_left', 'top_right', 'top_left'] as const;
export type StampPosition = (typeof STAMP_POSITIONS)[number];

// The naming tokens EZD-712 offers (S15c Decision 3 lists six; {sheet} and {discipline} come with EZD-727).
export const NAMING_TOKENS = ['{address}', '{description}', '{rev}', '{date}'] as const;
// S15c File naming pattern: characters a file name may not hold.
export const FORBIDDEN_NAME_CHARS = [
  '/',
  '?',
  '<',
  '>',
  '\\',
  ':',
  '*',
  '|',
  '"',
  ',',
  '#',
] as const;

// EZD-713 (S15c File split, Resubmittal mode, Minimum scale check; 08 settings 1, 8 and 9). Values match the table
// checks of 20261119140000_create_submittal_profile.sql.
export const FILE_SPLITS = ['combined', 'per_discipline', 'per_sheet'] as const;
export type FileSplit = (typeof FILE_SPLITS)[number];
export const REVISION_NAMINGS = ['version_in_name', 'same_name'] as const;
export type RevisionNaming = (typeof REVISION_NAMINGS)[number];
export const RESUBMITTAL_MODES = ['changed_sheets', 'full_set_narrative'] as const;
export type ResubmittalMode = (typeof RESUBMITTAL_MODES)[number];
// The board's Min. plan scale chips, in inches per foot: 3/16" = 1'-0", 1/4" = 1'-0", 1/8" = 1'-0".
export const MIN_SCALES = [0.1875, 0.25, 0.125] as const;
export const MAX_FILE_MB_MAX = 10000;
export const NAMING_LENGTH_MAX = 255;
export const MIN_SCALE_MAX = 12;

export const DEPARTMENT_MAX = 200;
export const NAMING_TEMPLATE_MAX = 200;
export const STAMP_MAX_IN = 24;

// One profile row, camelCase. Columns EZD-713 puts on screen are carried as stored.
export type SubmittalProfile = {
  id: string;
  department: string;
  isDefault: boolean;
  archived: boolean;
  submittalType: SubmittalType;
  sheetSize: '24x36';
  namingTemplate: string;
  stampBoxWidthIn: number;
  stampBoxHeightIn: number;
  stampBoxPosition: StampPosition;
  signer: Signer;
  fileSplit: FileSplit;
  maxFileMb: number | null;
  namingMaxLength: number | null;
  namingUpper: boolean;
  revisionNaming: RevisionNaming;
  flatten: boolean;
  exportUnsigned: boolean;
  bookmarks: boolean;
  tocSheet: boolean;
  resubmittalMode: ResubmittalMode;
  transmittal: boolean;
  minScaleInPerFt: number | null;
  // EZD-714 (S15c Required notes): ids of notes from the notes library, in print order.
  requiredNotes: string[];
  projectCount: number;
};

// The inspector fields (EZD-712, EZD-714 required notes, EZD-713 the rest of S15c).
export type ProfileFields = {
  department: string;
  submittalType: SubmittalType;
  namingTemplate: string;
  stampBoxWidthIn: number;
  stampBoxHeightIn: number;
  stampBoxPosition: StampPosition;
  signer: Signer;
  requiredNotes: string[];
  fileSplit: FileSplit;
  // null: no limit (S15c "Empty = no limit"). NaN in the form while the input holds something that is not a number.
  maxFileMb: number | null;
  namingMaxLength: number | null;
  namingUpper: boolean;
  revisionNaming: RevisionNaming;
  flatten: boolean;
  exportUnsigned: boolean;
  bookmarks: boolean;
  tocSheet: boolean;
  resubmittalMode: ResubmittalMode;
  transmittal: boolean;
  minScaleInPerFt: number | null;
};
export const PROFILE_FIELDS = [
  'department',
  'submittalType',
  'namingTemplate',
  'stampBoxWidthIn',
  'stampBoxHeightIn',
  'stampBoxPosition',
  'signer',
  'requiredNotes',
  'fileSplit',
  'maxFileMb',
  'namingMaxLength',
  'namingUpper',
  'revisionNaming',
  'flatten',
  'exportUnsigned',
  'bookmarks',
  'tocSheet',
  'resubmittalMode',
  'transmittal',
  'minScaleInPerFt',
] as const satisfies readonly (keyof ProfileFields)[];

// The column each field is stored in.
export const FIELD_COLUMN: Record<keyof ProfileFields, string> = {
  department: 'department',
  submittalType: 'submittal_type',
  namingTemplate: 'naming_template',
  stampBoxWidthIn: 'stamp_box_width_in',
  stampBoxHeightIn: 'stamp_box_height_in',
  stampBoxPosition: 'stamp_box_position',
  signer: 'signer',
  requiredNotes: 'required_notes',
  fileSplit: 'file_split',
  maxFileMb: 'max_file_mb',
  namingMaxLength: 'naming_max_length',
  namingUpper: 'naming_upper',
  revisionNaming: 'revision_naming',
  flatten: 'flatten',
  exportUnsigned: 'export_unsigned',
  bookmarks: 'bookmarks',
  tocSheet: 'toc_sheet',
  resubmittalMode: 'resubmittal_mode',
  transmittal: 'transmittal',
  minScaleInPerFt: 'min_scale_in_per_ft',
};

// EZD-714: a profile names at most this many required notes.
export const REQUIRED_NOTES_MAX = 100;

type Row = Record<string, unknown>;

const num = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

const orNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = num(v, NaN);
  return Number.isFinite(n) ? n : null;
};

export function profileOf(row: Row, projectCount = 0): SubmittalProfile {
  return {
    id: String(row.id),
    department: String(row.department ?? ''),
    isDefault: row.is_default === true,
    archived: row.archived_at !== null && row.archived_at !== undefined,
    submittalType: row.submittal_type === 'paper' ? 'paper' : 'electronic',
    sheetSize: '24x36',
    namingTemplate: String(row.naming_template ?? '{address} {description}'),
    stampBoxWidthIn: num(row.stamp_box_width_in, 3),
    stampBoxHeightIn: num(row.stamp_box_height_in, 3),
    stampBoxPosition: (STAMP_POSITIONS as readonly unknown[]).includes(row.stamp_box_position)
      ? (row.stamp_box_position as StampPosition)
      : 'bottom_right',
    signer: ([...SIGNERS, 'engineer'] as readonly unknown[]).includes(row.signer)
      ? (row.signer as Signer)
      : 'none',
    fileSplit: (FILE_SPLITS as readonly unknown[]).includes(row.file_split)
      ? (row.file_split as FileSplit)
      : 'combined',
    maxFileMb: orNull(row.max_file_mb),
    namingMaxLength: orNull(row.naming_max_length),
    namingUpper: row.naming_upper === true,
    revisionNaming: row.revision_naming === 'same_name' ? 'same_name' : 'version_in_name',
    flatten: row.flatten === true,
    exportUnsigned: row.export_unsigned === true,
    // S15c Bookmarks: on by default (the table default).
    bookmarks: row.bookmarks !== false,
    tocSheet: row.toc_sheet === true,
    resubmittalMode:
      row.resubmittal_mode === 'full_set_narrative' ? 'full_set_narrative' : 'changed_sheets',
    transmittal: row.transmittal === true,
    minScaleInPerFt: orNull(row.min_scale_in_per_ft),
    requiredNotes: Array.isArray(row.required_notes)
      ? row.required_notes.filter((x): x is string => typeof x === 'string')
      : [],
    projectCount,
  };
}

export const fieldsOf = (p: SubmittalProfile): ProfileFields => ({
  department: p.department,
  submittalType: p.submittalType,
  namingTemplate: p.namingTemplate,
  stampBoxWidthIn: p.stampBoxWidthIn,
  stampBoxHeightIn: p.stampBoxHeightIn,
  stampBoxPosition: p.stampBoxPosition,
  signer: p.signer,
  requiredNotes: [...p.requiredNotes],
  fileSplit: p.fileSplit,
  maxFileMb: p.maxFileMb,
  namingMaxLength: p.namingMaxLength,
  namingUpper: p.namingUpper,
  revisionNaming: p.revisionNaming,
  flatten: p.flatten,
  exportUnsigned: p.exportUnsigned,
  bookmarks: p.bookmarks,
  tocSheet: p.tocSheet,
  resubmittalMode: p.resubmittalMode,
  transmittal: p.transmittal,
  minScaleInPerFt: p.minScaleInPerFt,
});

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

// The list order: the default first, then active by name, then archived by name.
export function sortProfiles(list: readonly SubmittalProfile[]): SubmittalProfile[] {
  const rank = (p: SubmittalProfile) => (p.isDefault ? 0 : p.archived ? 2 : 1);
  return [...list].sort(
    (a, b) =>
      rank(a) - rank(b) || a.department.localeCompare(b.department, 'en', { sensitivity: 'base' }),
  );
}

// Sample values for the file name example under the naming template (S15c "e.g. 336 Golfview Rd buildingplans").
const EXAMPLE: Record<string, string> = {
  '{address}': '336 Golfview Rd',
  '{description}': 'buildingplans',
  '{rev}': 'Rev 1',
  '{date}': '2026-11-19',
};

// EZD-713: the example follows the profile's letter case and length limit, as the export names files.
export function exampleName(
  template: string,
  opts: Omit<NameOptions, 'suffix'> = { upper: false, maxLength: null },
): string {
  const values = Object.fromEntries(Object.entries(EXAMPLE).map(([k, v]) => [k.slice(1, -1), v]));
  return fileName(template.trim(), values, opts);
}

// EZD-713 (S15c File naming pattern; 08 setting 3): one file name from a template and the token values. The
// characters / ? < > \ : * | " , # and double or trailing spaces are stripped, ALL CAPS when the profile says so,
// and the length limit counts the whole name with ".pdf" (board "[Address] buildingplans Rev 1.pdf 33 / 80").
const EXT = '.pdf';

const clean = (s: string): string => {
  let out = s;
  for (const c of FORBIDDEN_NAME_CHARS) out = out.split(c).join('');
  return out.replace(/\s+/g, ' ').trim();
};

const fill = (template: string, values: Record<string, string>): string =>
  template.replace(/\{([a-z]+)\}/g, (whole, k: string) => values[k] ?? whole);

const cut = (s: string, max: number): string => s.slice(0, Math.max(1, max)).trimEnd();

export type NameOptions = {
  upper: boolean;
  // The longest file name, ".pdf" included; null = no limit.
  maxLength: number | null;
  // Text added at the end, after a space, kept whole when the name is shortened.
  suffix?: string;
};

// One file name from a template and the token values.
export function fileName(
  template: string,
  values: Record<string, string>,
  { upper, maxLength, suffix }: NameOptions,
): string {
  let head = clean(fill(template, values));
  const tail = suffix === undefined ? '' : clean(suffix);
  const sep = head && tail ? ' ' : '';
  if (maxLength !== null) {
    const room = maxLength - EXT.length - sep.length - tail.length;
    if (head.length > room) head = cut(head, room);
  }
  const base = `${head}${sep}${tail}`;
  return `${upper ? base.toUpperCase() : base}${EXT}`;
}

export type NamingCheck = {
  // A message key when the pattern cannot be saved.
  error: MessageKey | null;
  // S15c: a warning when the pattern omits {rev} while the profile keeps the version in the file name.
  warnRev: boolean;
};

// S15c Validation: the pattern must include {address}, use only the known tokens and give a valid file name.
export function checkNamingTemplate(
  template: string,
  revisionNaming: SubmittalProfile['revisionNaming'] = 'version_in_name',
): NamingCheck {
  const t = template.trim();
  let error: MessageKey | null = null;
  if (t.length === 0 || t.length > NAMING_TEMPLATE_MAX)
    error = 'office.sheet_presets.naming_required';
  else if (!t.includes('{address}')) error = 'office.sheet_presets.naming_needs_address';
  else {
    const tokens = t.match(/\{[^{}]*\}/g) ?? [];
    const literal = t.replace(/\{[^{}]*\}/g, '');
    if (
      tokens.some((k) => !(NAMING_TOKENS as readonly string[]).includes(k)) ||
      /[{}]/.test(literal)
    ) {
      error = 'office.sheet_presets.naming_unknown_token';
    } else if (FORBIDDEN_NAME_CHARS.some((c) => literal.includes(c))) {
      error = 'office.sheet_presets.naming_bad_chars';
    }
  }
  return {
    error,
    warnRev: error === null && revisionNaming === 'version_in_name' && !t.includes('{rev}'),
  };
}

// The table checks: max_file_mb null or in (0, 10000]; naming_max_length null or a whole number 1 to 255;
// min_scale_in_per_ft null or in (0, 12].
const maxFileOk = (v: unknown): v is number | null =>
  v === null || (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= MAX_FILE_MB_MAX);
const namingLengthOk = (v: unknown): v is number | null =>
  v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= NAMING_LENGTH_MAX);
const minScaleOk = (v: unknown): v is number | null =>
  v === null || (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= MIN_SCALE_MAX);

// Field problems as message keys; empty when the fields can be saved.
export function checkFields(
  f: ProfileFields,
  revisionNaming: SubmittalProfile['revisionNaming'],
): MessageKey[] {
  const out: MessageKey[] = [];
  const name = f.department.trim();
  if (name.length === 0 || name.length > DEPARTMENT_MAX)
    out.push('office.sheet_presets.name_required');
  const naming = checkNamingTemplate(f.namingTemplate, revisionNaming).error;
  if (naming) out.push(naming);
  const stampOk = (n: number) => Number.isFinite(n) && n > 0 && n <= STAMP_MAX_IN;
  if (!stampOk(f.stampBoxWidthIn) || !stampOk(f.stampBoxHeightIn))
    out.push('office.sheet_presets.stamp_invalid');
  if (!maxFileOk(f.maxFileMb)) out.push('office.sheet_presets.max_file_invalid');
  if (!namingLengthOk(f.namingMaxLength)) out.push('office.sheet_presets.naming_max_invalid');
  return out;
}

// What changed between the saved profile and the form, as the PATCH `fields` body; null when nothing did.
export function changedFields(
  saved: SubmittalProfile,
  form: ProfileFields,
): Partial<ProfileFields> | null {
  const before = fieldsOf(saved);
  const out: Partial<ProfileFields> = {};
  for (const k of PROFILE_FIELDS) {
    if (k === 'requiredNotes') {
      if (!sameList(form.requiredNotes, before.requiredNotes))
        out.requiredNotes = [...form.requiredNotes];
      continue;
    }
    const v = k === 'department' || k === 'namingTemplate' ? (form[k] as string).trim() : form[k];
    if (v !== before[k]) (out as Record<string, unknown>)[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// POST /api/settings/sheet-presets: `{ department, sourceId? }`.
export type CreateProfileBody = { department: string; sourceId: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

const isObject = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseCreateBody(raw: unknown): CreateProfileBody | null {
  if (!isObject(raw)) return null;
  for (const k of Object.keys(raw)) if (k !== 'department' && k !== 'sourceId') return null;
  const { department, sourceId } = raw;
  if (typeof department !== 'string') return null;
  const name = department.trim();
  if (name.length === 0 || name.length > DEPARTMENT_MAX) return null;
  if (sourceId !== undefined && sourceId !== null && !isUuid(sourceId)) return null;
  return { department: name, sourceId: (sourceId as string | null | undefined) ?? null };
}

// PATCH /api/settings/sheet-presets/[id]: exactly one of `{ fields }`, `{ setDefault: true }` or
// `{ archived: boolean }`.
export type PatchProfileBody =
  | { kind: 'fields'; columns: Record<string, string | number | boolean | null | string[]> }
  | { kind: 'default' }
  | { kind: 'archive'; archived: boolean };

export function parsePatchBody(raw: unknown): PatchProfileBody | null {
  if (!isObject(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length !== 1) return null;
  if (keys[0] === 'setDefault') return raw.setDefault === true ? { kind: 'default' } : null;
  if (keys[0] === 'archived') {
    return typeof raw.archived === 'boolean' ? { kind: 'archive', archived: raw.archived } : null;
  }
  if (keys[0] !== 'fields' || !isObject(raw.fields)) return null;
  const f = raw.fields;
  const columns: Record<string, string | number | boolean | null | string[]> = {};
  for (const [k, v] of Object.entries(f)) {
    if (!(PROFILE_FIELDS as readonly string[]).includes(k)) return null;
    const key = k as keyof ProfileFields;
    if (key === 'department') {
      if (typeof v !== 'string' || v.trim().length === 0 || v.trim().length > DEPARTMENT_MAX)
        return null;
      columns[FIELD_COLUMN[key]] = v.trim();
    } else if (key === 'namingTemplate') {
      if (typeof v !== 'string' || checkNamingTemplate(v).error !== null) return null;
      columns[FIELD_COLUMN[key]] = v.trim();
    } else if (key === 'stampBoxWidthIn' || key === 'stampBoxHeightIn') {
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > STAMP_MAX_IN) return null;
      columns[FIELD_COLUMN[key]] = v;
    } else if (key === 'submittalType') {
      if (!(SUBMITTAL_TYPES as readonly unknown[]).includes(v)) return null;
      columns[FIELD_COLUMN[key]] = v as string;
    } else if (key === 'stampBoxPosition') {
      if (!(STAMP_POSITIONS as readonly unknown[]).includes(v)) return null;
      columns[FIELD_COLUMN[key]] = v as string;
    } else if (key === 'signer') {
      if (!(SIGNERS as readonly unknown[]).includes(v)) return null;
      columns[FIELD_COLUMN[key]] = v as string;
    } else if (key === 'requiredNotes') {
      // Note ids, each once; the database checks they are the company's notes (EZD-714 migration).
      if (!Array.isArray(v) || v.length > REQUIRED_NOTES_MAX || !v.every(isUuid)) return null;
      if (new Set(v.map((x) => x.toLowerCase())).size !== v.length) return null;
      columns[FIELD_COLUMN[key]] = [...v];
    } else if (key === 'fileSplit') {
      if (!(FILE_SPLITS as readonly unknown[]).includes(v)) return null;
      columns[FIELD_COLUMN[key]] = v as string;
    } else if (key === 'revisionNaming') {
      if (!(REVISION_NAMINGS as readonly unknown[]).includes(v)) return null;
      columns[FIELD_COLUMN[key]] = v as string;
    } else if (key === 'resubmittalMode') {
      if (!(RESUBMITTAL_MODES as readonly unknown[]).includes(v)) return null;
      columns[FIELD_COLUMN[key]] = v as string;
    } else if (key === 'maxFileMb') {
      if (!maxFileOk(v)) return null;
      columns[FIELD_COLUMN[key]] = v;
    } else if (key === 'namingMaxLength') {
      if (!namingLengthOk(v)) return null;
      columns[FIELD_COLUMN[key]] = v;
    } else if (key === 'minScaleInPerFt') {
      if (!minScaleOk(v)) return null;
      columns[FIELD_COLUMN[key]] = v;
    } else {
      // namingUpper, flatten, exportUnsigned, bookmarks, tocSheet, transmittal: switches.
      if (typeof v !== 'boolean') return null;
      columns[FIELD_COLUMN[key]] = v;
    }
  }
  if (Object.keys(columns).length === 0) return null;
  return { kind: 'fields', columns };
}

// The event fields of a field save: the columns that changed.
export const changedColumns = (changed: unknown): string[] =>
  Array.isArray(changed)
    ? changed.filter((c): c is string => typeof c === 'string' && c !== 'updated_at')
    : [];

export const submittalTypeLabel = (t: SubmittalType): MessageKey =>
  `office.sheet_presets.type.${t}`;
export const signerLabel = (s: Signer): MessageKey => `office.sheet_presets.signer.${s}`;
export const stampPositionLabel = (p: StampPosition): MessageKey =>
  `office.sheet_presets.stamp_position.${p}`;
export const fileSplitLabel = (s: FileSplit): MessageKey => `office.sheet_presets.split.${s}`;
export const revisionNamingLabel = (r: RevisionNaming): MessageKey =>
  `office.sheet_presets.revision.${r}`;
export const resubmittalModeLabel = (m: ResubmittalMode): MessageKey =>
  `office.sheet_presets.resubmittal.${m}`;

// A scale in inches per foot as the board writes it: 0.1875 -> 3/16" = 1'-0".
export function scaleLabel(inPerFt: number): string {
  const sixteenths = Math.round(inPerFt * 16);
  if (Math.abs(sixteenths / 16 - inPerFt) > 1e-9 || sixteenths <= 0) return `${inPerFt}" = 1'-0"`;
  const whole = Math.floor(sixteenths / 16);
  let n = sixteenths % 16;
  let d = 16;
  while (n > 0 && n % 2 === 0) {
    n /= 2;
    d /= 2;
  }
  const frac = n === 0 ? '' : `${n}/${d}`;
  const text = whole > 0 ? (frac ? `${whole} ${frac}` : `${whole}`) : frac;
  return `${text}" = 1'-0"`;
}

// GET /api/projects/[id]/submittal-profile: the project's profile and the choices Project settings offers.
export type ProjectProfileChoice = {
  id: string;
  department: string;
  isDefault: boolean;
  archived: boolean;
};
export type ProjectProfileAnswer = {
  profileId: string | null;
  profiles: ProjectProfileChoice[];
  // The caller holds settings_sheet_presets: the dialog links to Settings > Sheet presets.
  canManage: boolean;
};
