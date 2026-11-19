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
  fileSplit: string;
  maxFileMb: number | null;
  revisionNaming: 'version_in_name' | 'same_name';
  flatten: boolean;
  projectCount: number;
};

// The inspector fields EZD-712 edits.
export type ProfileFields = {
  department: string;
  submittalType: SubmittalType;
  namingTemplate: string;
  stampBoxWidthIn: number;
  stampBoxHeightIn: number;
  stampBoxPosition: StampPosition;
  signer: Signer;
};
export const PROFILE_FIELDS = [
  'department',
  'submittalType',
  'namingTemplate',
  'stampBoxWidthIn',
  'stampBoxHeightIn',
  'stampBoxPosition',
  'signer',
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
};

type Row = Record<string, unknown>;

const num = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
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
    fileSplit: String(row.file_split ?? 'combined'),
    maxFileMb:
      row.max_file_mb === null || row.max_file_mb === undefined ? null : num(row.max_file_mb, 0),
    revisionNaming: row.revision_naming === 'same_name' ? 'same_name' : 'version_in_name',
    flatten: row.flatten === true,
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
});

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

export function exampleName(template: string): string {
  let out = template.trim();
  for (const [k, v] of Object.entries(EXAMPLE)) out = out.split(k).join(v);
  return `${out.replace(/\s+/g, ' ').trim()}.pdf`;
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
  | { kind: 'fields'; columns: Record<string, string | number> }
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
  const columns: Record<string, string | number> = {};
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
