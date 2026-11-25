// EZD-710 (S13 Data shown "Title block"; S15b Decisions 1, 2; 03c property_record; 03e project scope_of_work;
// AC-EZD-710-1): a project's title block, read under the member's session so RLS applies: the company's name, license,
// contact, logo and title block switch (EZD-709), the project's name, address, scope of work and effective code
// edition (EZD-613), the owner and parcel number from its property record, and the signed-in user's initials.
// A project the member cannot see reads as null.
import type { SupabaseClient } from '@supabase/supabase-js';
import { editionLabel, projectEdition } from '../../lib/code-edition/editions';
import type { ProjectTitleBlock } from '../../lib/title-block/sheet-title-block';
import { initialsFor } from '../../lib/users/initials';
import type { Session } from '../auth/session';
import type { Database } from '../db/database.types';
import { catalogFor } from '../messages/catalog';
import { loadTitleBlockSettings } from './title-block';

type Client = SupabaseClient<Database>;

export async function loadProjectTitleBlock(
  client: Client,
  projectId: string,
  session: Pick<Session, 'appUserId' | 'email'>,
): Promise<ProjectTitleBlock | null> {
  const project = await client
    .from('project')
    .select('name, address, scope_of_work, code_edition, property_record_id')
    .eq('id', projectId)
    .maybeSingle();
  if (project.error) throw project.error;
  if (project.data === null) return null;
  const p = project.data;

  const [settings, tenantEdition, record, user] = await Promise.all([
    loadTitleBlockSettings(client),
    client.from('tenant').select('code_edition').maybeSingle(),
    p.property_record_id === null
      ? Promise.resolve({ data: null, error: null })
      : client
          .from('property_record')
          .select('parcel_no, owner')
          .eq('id', p.property_record_id)
          .maybeSingle(),
    client.from('app_user').select('name').eq('id', session.appUserId).maybeSingle(),
  ]);
  if (tenantEdition.error) throw tenantEdition.error;
  if (record.error) throw record.error;
  if (user.error) throw user.error;

  // Permit sheets are English only (S13 Decision 7).
  const edition = projectEdition(p.code_edition, tenantEdition.data?.code_edition ?? null);
  const codeEdition = catalogFor('office', 'en')[editionLabel(edition)] ?? null;

  return {
    company:
      settings !== null && settings.config.showCompany
        ? {
            name: settings.company.name,
            licenseNo: settings.company.licenseNo,
            contact: settings.company.contact,
            logoUrl: settings.company.logoUrl,
          }
        : null,
    companyName: settings?.company.name ?? null,
    licenseNo: settings?.company.licenseNo ?? null,
    projectName: p.name,
    address: p.address,
    codeEdition: typeof codeEdition === 'string' ? codeEdition : null,
    scopeOfWork: p.scope_of_work,
    owner: record.data?.owner ?? null,
    parcel: record.data?.parcel_no ?? null,
    drawn: initialsFor(user.data?.name ?? null, session.email),
  };
}
