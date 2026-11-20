// EZD-130 (Q-0697 decisions 03 "Defaults data", 10 "Phase 8 permissions"; Q-0202; Q-0400; Q-0399; S15d
// Decision 4; 09o Value checks, Copy at creation rows 1-3; AC-EZD-130-1..6): the server side of Project settings.
// The read goes through the member's session (RLS); the save is checked here (the New project rules, the
// Defaults value checks and the rule between the standard overhang and the company's seating limit) and written
// through update_project_settings, which checks the permissions, the client and the edit lock epoch again.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { PER_PROJECT_KEYS, defaultRow } from '../../lib/defaults/registry';
import {
  applyChanges,
  checkValue,
  crossCheck,
  effectiveDefaults,
  effectiveValue,
  type StoredDefaults,
} from '../../lib/defaults/values';
import {
  PROJECT_ADDRESS_MAX,
  PROJECT_NAME_MAX,
  PROJECT_TYPES,
  SCOPE_OF_WORK_MAX,
} from '../../lib/projects/new-project';
import {
  isProjectType,
  type FieldErrors,
  type ProjectSettings,
  type ProjectSettingsPatch,
} from '../../lib/projects/project-settings';
import { CODE_EDITIONS, isCodeEdition, projectEdition } from '../../lib/code-edition/editions';
import { can, type PermissionContext } from '../permissions';
import type { Database, Json } from '../db/database.types';
import { loadTenantDefaults, projectCopyOf } from '../defaults/defaults';

type Client = SupabaseClient<Database>;

// Who sees the client's email and phone (Q-0697 10).
function seesContact(ctx: PermissionContext): boolean {
  return (
    can(ctx, 'settings_company') || can(ctx, 'create_projects') || can(ctx, 'send_to_client')
  );
}

export type LoadedProject = {
  settings: ProjectSettings;
  stored: StoredDefaults;
  copy: StoredDefaults;
};

// The read, or null when the project is not there for this member (another company's reads as none).
export async function loadProjectSettings(
  client: Client,
  ctx: PermissionContext,
  id: string,
): Promise<LoadedProject | null> {
  const [project, stored, tenant] = await Promise.all([
    client
      .from('project')
      .select(
        'id, name, address, type, scope_of_work, settings, code_edition, customer!project_customer_fk(id, name, email, phone)',
      )
      .eq('id', id)
      .maybeSingle(),
    loadTenantDefaults(client),
    client.from('tenant').select('code_edition').maybeSingle(),
  ]);
  if (project.error) throw project.error;
  if (tenant.error) throw tenant.error;
  const p = project.data;
  if (p === null) return null;
  const copy = projectCopyOf(p.settings);
  const effective = effectiveDefaults(stored, copy);
  const defaults: Record<string, number | null> = {};
  for (const key of PER_PROJECT_KEYS) {
    const v = effective[key];
    defaults[key] = typeof v === 'number' ? v : null;
  }
  const c = p.customer;
  const contact = seesContact(ctx);
  const editModel = can(ctx, 'edit_model', { projectId: id });
  const settings: ProjectSettings = {
    project: {
      id: p.id,
      name: p.name,
      address: p.address,
      type: isProjectType(p.type) ? p.type : 'kitchen',
      scopeOfWork: p.scope_of_work ?? '',
    },
    client: c
      ? contact
        ? { id: c.id, name: c.name, email: c.email, phone: c.phone }
        : { id: c.id, name: c.name }
      : null,
    defaults,
    codeEdition: {
      own: isCodeEdition(p.code_edition) ? p.code_edition : null,
      effective: projectEdition(p.code_edition, tenant.data?.code_edition ?? null),
    },
    can: {
      details: editModel,
      client:
        can(ctx, 'settings_company', { projectId: id }) ||
        can(ctx, 'create_projects', { projectId: id }),
      typeAndDefaults: editModel,
    },
  };
  return { settings, stored, copy };
}

const trimmed = (max: number) => z.string().max(max * 2);

const patchSchema = z.strictObject({
  name: trimmed(PROJECT_NAME_MAX).optional(),
  address: trimmed(PROJECT_ADDRESS_MAX).optional(),
  scopeOfWork: trimmed(SCOPE_OF_WORK_MAX).optional(),
  type: z.enum(PROJECT_TYPES).optional(),
  customerId: z.uuid().nullable().optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
  codeEdition: z.enum(CODE_EDITIONS).optional(),
  lockEpoch: z.number().int().min(0).optional(),
});

export type ParsedPatch =
  | { ok: true; patch: ProjectSettingsPatch }
  | { ok: false; fields?: FieldErrors };

// The PATCH body: unknown keys (submittal profile, ...) are refused (Q-0399); the code edition is one of the
// editions (EZD-613); name and address
// must not be blank; each default must be a per-project key with a value its row accepts.
export function parseProjectSettingsPatch(body: unknown): ParsedPatch {
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return { ok: false };
  const d = parsed.data;
  const fields: FieldErrors = {};
  const patch: ProjectSettingsPatch = {};
  if (d.name !== undefined) {
    const name = d.name.trim();
    if (name === '') fields.name = 'office.project_settings.name_required';
    else if (name.length > PROJECT_NAME_MAX) fields.name = 'office.project_settings.too_long';
    else patch.name = name;
  }
  if (d.address !== undefined) {
    const address = d.address.trim();
    if (address === '') fields.address = 'office.project_settings.address_required';
    else if (address.length > PROJECT_ADDRESS_MAX)
      fields.address = 'office.project_settings.too_long';
    else patch.address = address;
  }
  if (d.scopeOfWork !== undefined) {
    const scope = d.scopeOfWork.trim();
    if (scope.length > SCOPE_OF_WORK_MAX) fields.scopeOfWork = 'office.project_settings.too_long';
    else patch.scopeOfWork = scope;
  }
  if (d.type !== undefined) patch.type = d.type;
  if (d.customerId !== undefined) patch.customerId = d.customerId;
  if (d.codeEdition !== undefined) patch.codeEdition = d.codeEdition;
  if (d.defaults !== undefined) {
    const defaults: Record<string, number> = {};
    for (const [key, value] of Object.entries(d.defaults)) {
      const row = defaultRow(key);
      if (!row || !PER_PROJECT_KEYS.includes(key)) return { ok: false };
      const check = checkValue(row, value);
      if (!check.ok) fields[key] = check.messageKey;
      else defaults[key] = value as number;
    }
    patch.defaults = defaults;
  }
  if (d.lockEpoch !== undefined) patch.lockEpoch = d.lockEpoch;
  return Object.keys(fields).length > 0 ? { ok: false, fields } : { ok: true, patch };
}

// The defaults to write: the ones sent, and, when the save carries the lock, the company's effective value of
// every per-project key the project has no copy of (09o Copy at creation row 3; a key Not set stays out).
export function defaultsToWrite(
  patch: ProjectSettingsPatch,
  stored: StoredDefaults,
  copy: StoredDefaults,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (patch.lockEpoch !== undefined) {
    for (const key of PER_PROJECT_KEYS) {
      const own = copy[key];
      if (typeof own === 'number') continue;
      const v = effectiveValue(key, stored);
      if (typeof v === 'number') out[key] = v;
    }
  }
  return { ...out, ...(patch.defaults ?? {}) };
}

// The rule between rows on the values after the save (S15d:62; 09o Value checks row 4): the company's seating
// limit must stay above the project's standard overhang. The limit is not in the dialog, so the error is on the
// standard overhang.
export function crossCheckProject(
  stored: StoredDefaults,
  copy: StoredDefaults,
  defaults: Record<string, number>,
): FieldErrors {
  const after = effectiveDefaults(stored, applyChanges(copy, defaults));
  const errors = crossCheck(after);
  return errors.seating_support_limit && 'overhang_standard' in defaults
    ? { overhang_standard: errors.seating_support_limit }
    : {};
}

export type SaveSettingsResult =
  | { ok: true; tenantId: string; changed: string[] }
  | {
      ok: false;
      code:
        | 'permission_denied'
        | 'project_not_found'
        | 'invalid_input'
        | 'customer_unavailable'
        | 'stale_lock_epoch';
    };

export async function saveProjectSettings(
  client: Client,
  id: string,
  patch: ProjectSettingsPatch,
  defaults: Record<string, number>,
): Promise<SaveSettingsResult> {
  const changes: Record<string, Json> = {};
  if (patch.name !== undefined) changes.name = patch.name;
  if (patch.address !== undefined) changes.address = patch.address;
  if (patch.scopeOfWork !== undefined) changes.scope_of_work = patch.scopeOfWork;
  if (patch.type !== undefined) changes.type = patch.type;
  if (patch.customerId !== undefined) changes.customer_id = patch.customerId;
  if (patch.codeEdition !== undefined) changes.code_edition = patch.codeEdition;
  if (Object.keys(defaults).length > 0) changes.defaults = defaults;
  const { data, error } = await client.rpc('update_project_settings', {
    p_project: id,
    p_changes: changes,
    ...(patch.lockEpoch !== undefined ? { p_lock_epoch: patch.lockEpoch } : {}),
  });
  if (error) {
    if (error.code === '42501') return { ok: false, code: 'permission_denied' };
    if (error.code === 'P0002') return { ok: false, code: 'project_not_found' };
    if (error.code === '22023') {
      return {
        ok: false,
        code: error.message.includes('customer_unavailable') ? 'customer_unavailable' : 'invalid_input',
      };
    }
    throw error;
  }
  const r = data as { status?: string; tenant_id?: string; changed?: string[] } | null;
  if (r?.status === 'stale_lock_epoch') return { ok: false, code: 'stale_lock_epoch' };
  if (r?.status !== 'saved' || typeof r.tenant_id !== 'string') {
    throw new Error('update_project_settings_no_row');
  }
  return { ok: true, tenantId: r.tenant_id, changed: r.changed ?? [] };
}
