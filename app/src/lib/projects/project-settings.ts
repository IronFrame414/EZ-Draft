// EZD-130 (Q-0697 decisions 03 "Defaults data", 10 "Phase 8 permissions"; Q-0699; Q-0202; Q-0400; Q-0399;
// Q-0203; AC-EZD-130-2..6): the Project settings dialog's data, shared by the browser and the server. The read
// (`ProjectSettings`), the PATCH body (`ProjectSettingsPatch`), the dialog's draft and the body it sends. No
// React, no zod, no Supabase. Validation follows the New project dialog (name and address required, type one of
// three, client from the customer list) and the Defaults value checks (AC-EZD-116-4).
import type { MessageKey } from '../../server/messages/catalog';
import type { Customer } from '../customers/customers';
import {
  BY_PERMIT_DATE,
  isPermitDate,
  type CodeEdition,
  type CompanyEditionDefault,
} from '../code-edition/editions';
import { PER_PROJECT_KEYS, defaultRow } from '../defaults/registry';
import { formValueOf, parseFormValue } from '../defaults/values';
import {
  PROJECT_ADDRESS_MAX,
  PROJECT_NAME_MAX,
  PROJECT_TYPES,
  SCOPE_OF_WORK_MAX,
  isScopeTrade,
  normalizeScopeTrades,
  sameScopeTrades,
  type ProjectType,
  type ScopeTrade,
} from './new-project';

// The per-project keys in the dialog, registry order (waste factors, the four overhangs, the cabinet auto-fill
// and countertop increments; Q-0697 03).
export const PROJECT_SETTINGS_DEFAULT_KEYS: readonly string[] = PER_PROJECT_KEYS;

export type ProjectSettingsClient = {
  id: string;
  name: string;
  // Only to holders of Company settings, Create projects or Send to client (Q-0697 10); absent otherwise.
  email?: string;
  phone?: string | null;
};

export type ProjectSettings = {
  project: {
    id: string;
    name: string;
    address: string;
    type: ProjectType;
    scopeOfWork: string;
    // EZD-739 (Q-0764; Q-0779): the ticked scope boxes; absent reads as none ticked.
    scopeTrades?: ScopeTrade[];
    // EZD-643 (Q-0765): the optional permit application date, 'YYYY-MM-DD'; absent or null is none.
    permitApplicationDate?: string | null;
  };
  client: ProjectSettingsClient | null;
  // Each per-project key's effective value: the project's copy, else the company's effective value (null is
  // Not set).
  defaults: Record<string, number | null>;
  // EZD-613 (S15g Decision 2): the project's own code edition (null: none picked, it reads the company default)
  // and the edition it runs.
  // EZD-643 (Q-0765): `auto` is true when the edition follows the permit application date (absent reads false).
  codeEdition: { own: CodeEdition | null; effective: CodeEdition; auto?: boolean };
  // What this member may change. `typeAndDefaults` is Edit model on the project; the dialog also needs this tab
  // to hold the edit lock (the database checks the epoch).
  can: { details: boolean; client: boolean; typeAndDefaults: boolean };
};

export type ProjectSettingsPatch = {
  name?: string;
  address?: string;
  scopeOfWork?: string;
  scopeTrades?: ScopeTrade[];
  type?: ProjectType;
  customerId?: string | null;
  defaults?: Record<string, number>;
  // EZD-643: an edition picked by hand, or By permit date (the edition follows the date again).
  codeEdition?: CompanyEditionDefault;
  permitApplicationDate?: string | null;
  lockEpoch?: number;
};

// The keys the save reports as changed (project.updated `keys`): field names and per-project default keys.
export const PROJECT_FIELD_KEYS = [
  'name',
  'address',
  'scope_of_work',
  'type',
  'customer_id',
  'code_edition',
  'scope_trades',
  'permit_application_date',
] as const;

export type ProjectSettingsDraft = {
  name: string;
  address: string;
  scopeOfWork: string;
  scopeTrades: ScopeTrade[];
  type: ProjectType;
  client: Customer | null;
  defaults: Record<string, string>;
  codeEdition: CompanyEditionDefault;
  // EZD-643: '' is no date.
  permitApplicationDate: string;
};

export function draftOf(s: ProjectSettings): ProjectSettingsDraft {
  const defaults: Record<string, string> = {};
  for (const key of PROJECT_SETTINGS_DEFAULT_KEYS) {
    const row = defaultRow(key);
    if (!row) continue;
    defaults[key] = formValueOf(row, s.defaults[key] ?? null) as string;
  }
  return {
    name: s.project.name,
    address: s.project.address,
    scopeOfWork: s.project.scopeOfWork,
    scopeTrades: scopeTradesOf(s),
    type: s.project.type,
    client: s.client
      ? {
          id: s.client.id,
          name: s.client.name,
          email: s.client.email ?? '',
          phone: s.client.phone ?? null,
          address: null,
          archivedAt: null,
        }
      : null,
    defaults,
    codeEdition: codeEditionChoiceOf(s),
    permitApplicationDate: s.project.permitApplicationDate ?? '',
  };
}

// EZD-643 (Q-0765): what the Code edition select shows: By permit date for an automatic project, else the
// project's edition.
export function codeEditionChoiceOf(s: ProjectSettings): CompanyEditionDefault {
  return s.codeEdition.auto ? BY_PERMIT_DATE : (s.codeEdition.own ?? s.codeEdition.effective);
}

// The fields this tab may change: details with Edit model; type and defaults also with the lock held here;
// the client with Company settings or Create projects.
export type Editable = { details: boolean; client: boolean; locked: boolean };

export function editableFor(s: ProjectSettings, holding: boolean): Editable {
  return {
    details: s.can.details,
    client: s.can.client,
    locked: s.can.typeAndDefaults && holding,
  };
}

export function canSaveAny(e: Editable): boolean {
  return e.details || e.client || e.locked;
}

export type FieldErrors = Partial<Record<'name' | 'address' | string, MessageKey>>;

export type PatchResult =
  { ok: true; body: ProjectSettingsPatch } | { ok: false; fields: FieldErrors };

// The PATCH body for the fields that changed and that this tab may change. A holder's save carries the lock
// epoch, so the server also stores a copy of every per-project key the project lacks (09o Copy at creation
// row 3). A cleared default that had a value is refused (vault/build/assumptions.md EZD-130).
export function toPatchBody(
  s: ProjectSettings,
  d: ProjectSettingsDraft,
  e: Editable,
  lockEpoch: number | null,
): PatchResult {
  const fields: FieldErrors = {};
  const body: ProjectSettingsPatch = {};
  if (e.details) {
    const name = d.name.trim();
    const address = d.address.trim();
    if (name === '') fields.name = 'office.project_settings.name_required';
    else if (name.length > PROJECT_NAME_MAX) fields.name = 'office.project_settings.too_long';
    if (address === '') fields.address = 'office.project_settings.address_required';
    else if (address.length > PROJECT_ADDRESS_MAX) fields.address = 'office.project_settings.too_long';
    const scope = d.scopeOfWork.trim();
    if (scope.length > SCOPE_OF_WORK_MAX) fields.scopeOfWork = 'office.project_settings.too_long';
    if (name !== s.project.name) body.name = name;
    if (address !== s.project.address) body.address = address;
    if (scope !== s.project.scopeOfWork.trim()) body.scopeOfWork = scope;
    // EZD-739: the boxes are sent only when the ticked set changed (order does not count).
    if (!sameScopeTrades(d.scopeTrades, scopeTradesOf(s))) {
      body.scopeTrades = normalizeScopeTrades(d.scopeTrades);
    }
    // EZD-613: sent only when it differs from the edition the project runs, so opening and saving the dialog
    // never fixes a project to the company default.
    // EZD-643: By permit date counts as a choice of its own.
    if (d.codeEdition !== codeEditionChoiceOf(s)) {
      body.codeEdition = d.codeEdition;
    }
    // EZD-643 (Q-0765): the permit application date, sent only when it changed; '' clears it.
    const permit = d.permitApplicationDate.trim();
    if (permit !== (s.project.permitApplicationDate ?? '')) {
      if (permit !== '' && !isPermitDate(permit))
        fields.permitApplicationDate = 'office.project_settings.permit_date_invalid';
      else body.permitApplicationDate = permit === '' ? null : permit;
    }
  }
  if (e.client && (d.client?.id ?? null) !== (s.client?.id ?? null)) {
    body.customerId = d.client?.id ?? null;
  }
  if (e.locked) {
    if (d.type !== s.project.type) body.type = d.type;
    const defaults: Record<string, number> = {};
    for (const key of PROJECT_SETTINGS_DEFAULT_KEYS) {
      const row = defaultRow(key);
      const text = d.defaults[key];
      if (!row || text === undefined) continue;
      const parsed = parseFormValue(row, text);
      if (!parsed.ok) {
        fields[key] = parsed.messageKey;
        continue;
      }
      const before = s.defaults[key] ?? null;
      if (parsed.value === null) {
        if (before !== null) fields[key] = 'office.project_settings.default_required';
        continue;
      }
      if (parsed.value !== before) defaults[key] = parsed.value as number;
    }
    if (Object.keys(defaults).length > 0) body.defaults = defaults;
    if (lockEpoch !== null) body.lockEpoch = lockEpoch;
  }
  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, body };
}

export function scopeTradesOf(s: ProjectSettings): ScopeTrade[] {
  return normalizeScopeTrades((s.project.scopeTrades ?? []).filter(isScopeTrade));
}

export function isProjectType(v: unknown): v is ProjectType {
  return typeof v === 'string' && (PROJECT_TYPES as readonly string[]).includes(v);
}

// What a refused save shows (AC-EZD-130-6): field errors on their rows, else one message under the dialog; a
// failed save keeps the dialog open, its message saying Try again.
export type SaveFailure =
  { kind: 'fields'; fields: FieldErrors } | { kind: 'message'; message: MessageKey };

export function saveFailure(status: number, data: unknown): SaveFailure {
  const err = (data as { error?: { code?: unknown; fields?: unknown } } | null)?.error;
  if (status === 400 && err?.fields && typeof err.fields === 'object') {
    return { kind: 'fields', fields: err.fields as FieldErrors };
  }
  if (status === 400 && err?.code === 'customer_unavailable') {
    return { kind: 'message', message: 'error.project_customer_unavailable' };
  }
  if (status === 409) return { kind: 'message', message: 'error.stale_lock_epoch' };
  if (status === 403) return { kind: 'message', message: 'error.not_authorized' };
  return { kind: 'message', message: 'office.project_settings.save_failed' };
}
