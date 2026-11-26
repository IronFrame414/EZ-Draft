// EZD-709 (S15b; R24 #7, #26; Q-0182; AC-EZD-709-1, AC-EZD-709-2): the tenant title block.
// The layout is fixed; the company-block switch is the one setting (S15b Decision 1), stored as
// tenant.title_block.show_company (a missing value reads as on, assumptions EZD-709). Everything else fills from
// company and project data. The preview model is pure so the page re-renders it on every change.
import type { CodeEdition } from '../code-edition/editions';
import type { CompanyContact } from '../company/company';
import { isScopeTrade } from '../projects/new-project';
import { sheetsForSet } from '../sheets/sheet-set';
import type { MessageKey } from '../../server/messages/catalog';

export type TitleBlockConfig = { showCompany: boolean };
export const DEFAULT_TITLE_BLOCK: TitleBlockConfig = { showCompany: true };

// tenant.title_block (jsonb) → the config; anything unreadable is the default.
export function titleBlockOf(value: unknown): TitleBlockConfig {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_TITLE_BLOCK };
  const show = (value as Record<string, unknown>).show_company;
  return { showCompany: typeof show === 'boolean' ? show : DEFAULT_TITLE_BLOCK.showCompany };
}

// The PATCH body `{ showCompany: boolean }`; null for anything else.
export function parseTitleBlockPatch(raw: unknown): TitleBlockConfig | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length !== 1 || keys[0] !== 'showCompany') return null;
  const v = (raw as Record<string, unknown>).showCompany;
  return typeof v === 'boolean' ? { showCompany: v } : null;
}

export type TitleBlockCompany = {
  name: string;
  licenseNo: string | null;
  contact: CompanyContact;
  logoUrl: string | null;
};

export type TitleBlockSettings = {
  config: TitleBlockConfig;
  company: TitleBlockCompany;
  codeEdition: CodeEdition | null;
};

// S15b Validation: the tenant-level fields listed as warnings here, in this order.
export const COMPANY_FIELDS = ['company_name', 'license_number'] as const;
export type CompanyField = (typeof COMPANY_FIELDS)[number];

const blank = (v: string | null | undefined) => v === null || v === undefined || v.trim() === '';

export function missingCompanyFields(company: {
  name: string | null;
  licenseNo: string | null;
}): CompanyField[] {
  const out: CompanyField[] = [];
  if (blank(company.name)) out.push('company_name');
  if (blank(company.licenseNo)) out.push('license_number');
  return out;
}

// S15b Decision 2: "Title block complete" = these seven filled.
export const TITLE_BLOCK_FIELDS = [
  'company_name',
  'license_number',
  'project_address',
  'parcel_number',
  'owner',
  'scope_of_work',
  'code_edition',
] as const;
export type TitleBlockField = (typeof TITLE_BLOCK_FIELDS)[number];

export function missingTitleBlockFields(
  values: Partial<Record<TitleBlockField, string | null>>,
): TitleBlockField[] {
  return TITLE_BLOCK_FIELDS.filter((f) => blank(values[f]));
}

export const fieldLabel = (f: TitleBlockField): MessageKey => `office.title_block.field.${f}`;

// S15b Layout: preview at 24x36 (ARCH D, permit sets, R24 #48) and 11x17.
export const PREVIEW_SIZES = ['24x36', '11x17'] as const;
export type PreviewSize = (typeof PREVIEW_SIZES)[number];
export const SHEET_INCHES: Record<PreviewSize, { width: number; height: number }> = {
  '24x36': { width: 36, height: 24 },
  '11x17': { width: 17, height: 11 },
};

// The company block's contact line: name, license, then phone, email and website as filled.
export function companyLine(company: TitleBlockCompany): string {
  return [company.name, company.licenseNo, company.contact.phone, company.contact.email, company.contact.website]
    .filter((v): v is string => !blank(v))
    .map((v) => v.trim())
    .join(' · ');
}

export type RevisionRow = { kind: 'version' | 'rev'; number: number; date: string; description: MessageKey };

// Sample project values for the preview (assumptions EZD-709). R24 #26: client sends before permit are
// "Version N", permit issues are "Rev N".
export const SAMPLE_REVISIONS: readonly RevisionRow[] = [
  { kind: 'version', number: 1, date: '09/20/26', description: 'office.title_block.sample.rev_client' },
  { kind: 'rev', number: 1, date: '10/11/26', description: 'office.title_block.sample.rev_permit' },
];

export type TitleBlockPreview = {
  size: PreviewSize;
  sheet: { width: number; height: number };
  company: { name: string; licenseNo: string | null; contact: string[]; logoUrl: string | null } | null;
  codeEdition: CodeEdition | null;
  revisions: readonly RevisionRow[];
  sealBox: true;
  stampArea: true;
};

export function titleBlockPreview(
  settings: Pick<TitleBlockSettings, 'company' | 'codeEdition'>,
  config: TitleBlockConfig,
  size: PreviewSize,
): TitleBlockPreview {
  const c = settings.company;
  return {
    size,
    sheet: SHEET_INCHES[size],
    company: config.showCompany
      ? {
          name: c.name,
          licenseNo: blank(c.licenseNo) ? null : c.licenseNo,
          contact: [c.contact.phone, c.contact.email, c.contact.website].filter(
            (v): v is string => !blank(v),
          ),
          logoUrl: c.logoUrl,
        }
      : null,
    codeEdition: settings.codeEdition,
    revisions: SAMPLE_REVISIONS,
    sealBox: true,
    stampArea: true,
  };
}

// EZD-1991 (Q-0813; AC-EZD-1991-1; S15b head "Used on N sheets · Open Sheets"): the one company title block is on
// every sheet of every permit set (S15b "One company title block on every sheet"), so N is the sum of the permit
// set's sheets over the company's projects. Sheets are still worked out from each project's scope boxes
// (lib/sheets/sheet-set, EZD-701); the client set's R1.0 is the permit set's R1.0 again and is not counted twice
// (vault/build/assumptions.md EZD-1991).
export type TitleBlockUsage = {
  sheets: number;
  // The project Open Sheets opens: the most recently changed one; null with no projects (no link).
  projectId: string | null;
};

export function titleBlockSheetCount(
  projects: readonly { scopeTrades: readonly string[] }[],
): number {
  return projects.reduce(
    (n, p) => n + sheetsForSet('permit', p.scopeTrades.filter(isScopeTrade)).length,
    0,
  );
}

// The editor opened on its Sheets screen (`?view=sheets`, read by the editor page).
export function sheetsScreenHref(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}?view=sheets`;
}

// EZD-1991 (S15b "Zoom to title block"): the preview's title block column, as a share of the sheet's width
// (TitleBlockForm draws the column at this width), and the zoom that frames it: the sheet scaled so the column
// fills the preview's width, shifted so the column's left edge sits at the preview's left edge. The rest of the
// column is reached by scrolling the preview down.
export const TITLE_BLOCK_COLUMN: Record<PreviewSize, number> = { '24x36': 0.22, '11x17': 0.3 };

export function titleBlockZoom(size: PreviewSize): { scale: number; shift: number } {
  const w = TITLE_BLOCK_COLUMN[size];
  const scale = 1 / w;
  // In units of the unscaled sheet width: the column starts at (1 - w) and lands at (1 - w) * scale once scaled.
  return { scale, shift: -(1 - w) * scale };
}
