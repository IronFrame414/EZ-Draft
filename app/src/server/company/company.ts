// EZD-112 Step 10 (vault/plans/EZD-112.md Decided "`inspectLogo`", "Logo path", "Input parsing", "Server
// helpers"; S15a Validation; Q-0232): server-only helpers for Settings > Company. Reads go through the
// caller's session client (RLS: the tenant row is the claim tenant); logo links are signed for the default
// 900 s (EZD-132). `checkLogoObject` is Decided "Logo object check" (review round 1 finding 1).
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  CONTACT_KEYS,
  LOGO_MAX_BYTES,
  type CompanyContact,
  type CompanyData,
  type CompanyUpdate,
  type LogoKind,
  type LogoProblem,
} from '../../lib/company/company';
import type { Database, Json } from '../db/database.types';
import { readObject, removeObject, signedDownloadUrl, statObject } from '../storage';

const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

export function logoPathFor(
  tenantId: string,
  kind: LogoKind,
  id: string = crypto.randomUUID(),
): string {
  return `${tenantId}/tenant/logo/${id}.${kind}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function logoKindOfPath(tenantId: string, path: string): LogoKind | null {
  const re = new RegExp(`^${escapeRegExp(tenantId)}/tenant/logo/${UUID_PATTERN}\\.(png|jpg|svg)$`);
  const m = re.exec(path);
  return m ? (m[1] as LogoKind) : null;
}

export type LogoCheckProblem = LogoProblem | 'logo_svg_unsafe';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPG_SIGNATURE = [0xff, 0xd8, 0xff];
const SVG_ROOT = /<svg[\s>/]/i;
const SVG_UNSAFE = [
  /<script[\s>/]/i,
  /<foreignobject[\s>/]/i,
  /[\s/"']on[a-z]+\s*=/i,
  /javascript:/i,
  /<!entity/i,
];

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((b, i) => bytes[i] === b);
}

export function inspectLogo(bytes: Uint8Array, kind: LogoKind): LogoCheckProblem | null {
  if (bytes.length > LOGO_MAX_BYTES) return 'logo_too_large';
  if (bytes.length === 0) return 'logo_wrong_type';
  if (kind === 'png') return startsWith(bytes, PNG_SIGNATURE) ? null : 'logo_wrong_type';
  if (kind === 'jpg') return startsWith(bytes, JPG_SIGNATURE) ? null : 'logo_wrong_type';
  if (bytes.includes(0x00) || startsWith(bytes, [0xfe, 0xff]) || startsWith(bytes, [0xff, 0xfe])) {
    return 'logo_svg_unsafe';
  }
  let text = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true }).decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (!SVG_ROOT.test(text)) return 'logo_wrong_type';
  return SVG_UNSAFE.some((re) => re.test(text)) ? 'logo_svg_unsafe' : null;
}

export type LogoObjectCheck =
  | { ok: true; kind: LogoKind }
  | { ok: false; code: 'invalid_input' | LogoCheckProblem };

// Decided "Logo object check": the one check the check route and the save route run. A path that is not
// this company's logo path, or has no object, is invalid input; a too-large object is removed without a
// download; an object whose bytes fail `inspectLogo` is removed. Storage throws pass up to the route.
export async function checkLogoObject(
  client: SupabaseClient<Database>,
  tenantId: string,
  path: string,
): Promise<LogoObjectCheck> {
  const kind = logoKindOfPath(tenantId, path);
  if (kind === null) return { ok: false, code: 'invalid_input' };
  const target = { bucket: 'media' as const, path };
  const stat = await statObject(client, target);
  if (stat === null) return { ok: false, code: 'invalid_input' };
  if (stat.size > LOGO_MAX_BYTES) {
    await removeObject(client, target);
    return { ok: false, code: 'logo_too_large' };
  }
  const bytes = await readObject(client, target);
  if (bytes === null) return { ok: false, code: 'invalid_input' };
  const problem = inspectLogo(bytes, kind);
  if (problem) {
    await removeObject(client, target);
    return { ok: false, code: problem };
  }
  return { ok: true, kind };
}

const MAX_TEXT = 1000;
const text = z.string().max(MAX_TEXT);

const inputSchema = z.strictObject({
  name: text,
  licenseNo: text,
  contact: z.strictObject({
    phone: text,
    email: text,
    website: text,
    address: text,
  }),
  logo: z.discriminatedUnion('action', [
    z.strictObject({ action: z.literal('keep') }),
    z.strictObject({ action: z.literal('set'), path: text }),
    z.strictObject({ action: z.literal('remove') }),
  ]),
});

export type ParsedCompany =
  | { ok: true; value: CompanyUpdate }
  | { ok: false; code: 'invalid_input' | 'company_name_required' | 'invalid_email' };

export function parseCompanyInput(body: unknown): ParsedCompany {
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, code: 'invalid_input' };
  const input = parsed.data;
  const name = input.name.trim();
  if (name === '') return { ok: false, code: 'company_name_required' };
  const contact: CompanyContact = {};
  for (const key of CONTACT_KEYS) {
    const value = input.contact[key].trim();
    if (value !== '') contact[key] = value;
  }
  if (contact.email !== undefined && !z.email().safeParse(contact.email).success) {
    return { ok: false, code: 'invalid_email' };
  }
  const licenseNo = input.licenseNo.trim();
  return {
    ok: true,
    value: { name, licenseNo: licenseNo === '' ? null : licenseNo, contact, logo: input.logo },
  };
}

export async function currentTenantId(client: SupabaseClient<Database>): Promise<string | null> {
  const { data, error } = await client.from('tenant').select('id').maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

function contactOf(value: Json): CompanyContact {
  const contact: CompanyContact = {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return contact;
  for (const key of CONTACT_KEYS) {
    const v = value[key];
    if (typeof v === 'string') contact[key] = v;
  }
  return contact;
}

function kindOfStoredPath(path: string): LogoKind {
  const ext = path.slice(path.lastIndexOf('.') + 1);
  if (ext === 'png' || ext === 'jpg' || ext === 'svg') return ext;
  throw new Error('logo_path_invalid');
}

export async function toCompanyData(
  client: SupabaseClient<Database>,
  row: { name: string; logo_path: string | null; license_no: string | null; contact: Json },
): Promise<CompanyData> {
  let logo: CompanyData['logo'] = null;
  if (row.logo_path !== null) {
    const kind = kindOfStoredPath(row.logo_path);
    const url = await signedDownloadUrl(client, { bucket: 'media', path: row.logo_path });
    logo = { path: row.logo_path, url, kind };
  }
  return {
    name: row.name,
    licenseNo: row.license_no,
    contact: contactOf(row.contact),
    logo,
  };
}

export async function loadCompany(client: SupabaseClient<Database>): Promise<CompanyData | null> {
  const { data, error } = await client
    .from('tenant')
    .select('name, logo_path, license_no, contact')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toCompanyData(client, data);
}
