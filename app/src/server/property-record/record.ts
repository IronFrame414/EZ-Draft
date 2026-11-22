// EZD-711 (S01 Property appraiser link "user confirms each field ... Year built before 1978 sets the lead flag"; S13
// Controls "Property appraiser import ... Edit model"; 03c property_record; AC-EZD-711-1, -2): a project's property
// record, read and saved under the member's session. Saving goes through set_property_record (Edit model, a project
// the member can see; only the confirmed fields), which links the record to the project, so the title block prints
// the owner and PCN (server/title-block/sheet-title-block.ts). The lead flag is read from the record's year built.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  confirmedNames,
  isPre1978,
  type ConfirmedRecord,
  type PropertyField,
  type ProjectPropertyRecord,
} from '../../lib/property-record/property-record';
import type { Database } from '../db/database.types';

type Client = SupabaseClient<Database>;

/** The project's record (all fields blank when it has none); null when the member cannot see the project. */
export async function loadProjectPropertyRecord(
  client: Client,
  projectId: string,
): Promise<ProjectPropertyRecord | null> {
  const project = await client.from('project').select('property_record_id').eq('id', projectId).maybeSingle();
  if (project.error) throw project.error;
  if (project.data === null) return null;
  const id = project.data.property_record_id;
  const record =
    id === null
      ? { data: null, error: null }
      : await client
          .from('property_record')
          .select('parcel_no, owner, legal_description, year_built, living_area, source_url')
          .eq('id', id)
          .maybeSingle();
  if (record.error) throw record.error;
  const r = record.data;
  return {
    fields: {
      parcelNo: r?.parcel_no ?? null,
      owner: r?.owner ?? null,
      legalDescription: r?.legal_description ?? null,
      yearBuilt: r?.year_built ?? null,
      livingArea: r?.living_area ?? null,
    },
    sourceUrl: r?.source_url ?? null,
    leadFlag: isPre1978(r?.year_built ?? null),
  };
}

export type SaveRecordResult =
  | { ok: true; recordId: string; tenantId: string; fields: PropertyField[]; leadFlag: boolean }
  | { ok: false; code: 'permission_denied' | 'project_not_found' | 'invalid_input' };

const CODES: Record<string, 'permission_denied' | 'project_not_found' | 'invalid_input'> = {
  '42501': 'permission_denied',
  P0002: 'project_not_found',
  '22023': 'invalid_input',
  '22P02': 'project_not_found',
};

export async function saveProjectPropertyRecord(
  client: Client,
  projectId: string,
  record: ConfirmedRecord,
): Promise<SaveRecordResult> {
  const f = record.fields;
  const { data, error } = await client.rpc('set_property_record', {
    p_project: projectId,
    p_parcel_no: f.parcelNo as string,
    p_owner: f.owner as string,
    p_legal_description: f.legalDescription as string,
    p_year_built: f.yearBuilt as number,
    p_living_area: f.livingArea as number,
    p_source_url: record.sourceUrl as string,
  });
  if (error) {
    const code = CODES[error.code ?? ''];
    if (code) return { ok: false, code };
    throw error;
  }
  const project = await client.from('project').select('tenant_id').eq('id', projectId).single();
  if (project.error) throw project.error;
  return { ok: true, recordId: data, tenantId: project.data.tenant_id, fields: confirmedNames(f), leadFlag: isPre1978(f.yearBuilt) };
}
