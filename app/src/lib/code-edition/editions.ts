// EZD-613 (S15g; Q-0220; Q-0765; Q-0697 03 "Defaults data"; vault/build/assumptions.md EZD-613, EZD-643): the code
// editions the app knows, the company default and each project's effective edition. Browser and server.
// EZD-643 (Q-0220; Q-0765; board S15gCode): FBC 8th ed. with NEC 2020 joins FBC 9th ed. with NEC 2023, and the
// company default may be "By permit date (automatic)": a permit application date on or after 12/31/2026 gives the
// 9th Edition, an earlier one the 8th; with no date, the project's creation date (Florida time) decides. The
// migration holds the same lists and date (20261123164300_code_edition_by_permit_date.sql; editions-sql.test.ts).
import type { MessageKey } from '../../server/messages/catalog';

// The editions a project runs: rule sets are registered under these keys (app/src/lib/code-check/registry.ts).
export const CODE_EDITIONS = ['fbc9_nec2023', 'fbc8_nec2020'] as const;
export type CodeEdition = (typeof CODE_EDITIONS)[number];

// The company default: an edition, or the edition picked by the permit application date. Never an edition itself:
// it is resolved before a project stores or runs it.
export const BY_PERMIT_DATE = 'by_permit_date';
export const COMPANY_EDITION_DEFAULTS = [BY_PERMIT_DATE, ...CODE_EDITIONS] as const;
export type CompanyEditionDefault = (typeof COMPANY_EDITION_DEFAULTS)[number];

// The company default when the company never picked one (tenant.code_edition null): FBC 9th ed. with NEC 2023, as
// EZD-613 built it. The EZD-643 migration moved every company that existed then to By permit date (Q-0765), so a
// null default is a company made later that has not picked one (assumptions EZD-643).
export const DEFAULT_COMPANY_EDITION: CompanyEditionDefault = 'fbc9_nec2023';

// The edition of a company with no default (above); also what the electrical status bar shows until it reads the
// project (assumptions EZD-601, EZD-613).
export const DEFAULT_CODE_EDITION = 'fbc9_nec2023' satisfies CodeEdition;

// Q-0765: a permit application date on or after this day runs the 9th Edition (board S15gCode "From 12/31/26").
export const EDITION_CUTOVER_DATE = '2026-12-31';
// The creation date of a project with no permit date is read in Florida time (assumptions EZD-643).
export const EDITION_TIME_ZONE = 'America/New_York';

// The optional load-calc method default (S15g Electrical defaults; Round 24 #38), stored as a key of
// tenant.defaults. Off means the standard method only (assumptions EZD-615).
export const OPTIONAL_LOAD_CALC_KEY = 'optional_load_calc';
export const OPTIONAL_LOAD_CALC_DEFAULT = false;

export const editionLabel = (e: CodeEdition): MessageKey => `office.code_edition.edition.${e}`;
export const companyEditionLabel = (e: CompanyEditionDefault): MessageKey => `office.code_edition.edition.${e}`;

export function isCodeEdition(v: unknown): v is CodeEdition {
  return typeof v === 'string' && (CODE_EDITIONS as readonly string[]).includes(v);
}

export function isCompanyEditionDefault(v: unknown): v is CompanyEditionDefault {
  return typeof v === 'string' && (COMPANY_EDITION_DEFAULTS as readonly string[]).includes(v);
}

// A permit application date as stored: 'YYYY-MM-DD', a real calendar day.
export function isPermitDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// Q-0765: the edition for a permit application date ('YYYY-MM-DD').
export function editionForDate(date: string): CodeEdition {
  return date >= EDITION_CUTOVER_DATE ? 'fbc9_nec2023' : 'fbc8_nec2020';
}

// The calendar day of a moment in Florida time, 'YYYY-MM-DD'.
export function floridaDate(at: Date | string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: EDITION_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(typeof at === 'string' ? new Date(at) : at);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// Q-0765: an automatic project's edition, from its permit application date, else its creation date.
export function editionForProject(dates: { permitDate?: string | null; createdAt?: Date | string | null }): CodeEdition {
  if (isPermitDate(dates.permitDate)) return editionForDate(dates.permitDate);
  return editionForDate(floridaDate(dates.createdAt ?? new Date()));
}

// The company's default as stored, else FBC 9th ed. with NEC 2023.
export function companyDefault(tenantEdition: unknown): CompanyEditionDefault {
  return isCompanyEditionDefault(tenantEdition) ? tenantEdition : DEFAULT_COMPANY_EDITION;
}

// The edition a project with no edition of its own runs under the company default: the default's edition, or
// under By permit date the edition its dates pick. Always an edition.
export function companyEdition(
  tenantEdition: unknown,
  dates: { permitDate?: string | null; createdAt?: Date | string | null } = {},
): CodeEdition {
  const d = companyDefault(tenantEdition);
  return d === BY_PERMIT_DATE ? editionForProject(dates) : d;
}

// A project's edition: its own (every project stores one since EZD-643; an automatic project's is re-picked by the
// database when its date changes), else the company default for its dates. A project with its own edition keeps it
// whatever the company default becomes (S15g Save; AC-EZD-613-1).
export function projectEdition(
  projectEdition: unknown,
  tenantEdition: unknown,
  dates: { permitDate?: string | null; createdAt?: Date | string | null } = {},
): CodeEdition {
  return isCodeEdition(projectEdition) ? projectEdition : companyEdition(tenantEdition, dates);
}

// The optional load-calc method default from tenant.defaults.
export function optionalLoadCalcOf(defaults: unknown): boolean {
  if (typeof defaults !== 'object' || defaults === null || Array.isArray(defaults)) {
    return OPTIONAL_LOAD_CALC_DEFAULT;
  }
  const v = (defaults as Record<string, unknown>)[OPTIONAL_LOAD_CALC_KEY];
  return typeof v === 'boolean' ? v : OPTIONAL_LOAD_CALC_DEFAULT;
}

// GET and PATCH answer of /api/settings/code-edition.
export type CodeEditionSettings = {
  // The company default (EZD-643: an edition or By permit date).
  edition: CompanyEditionDefault;
  optionalLoadCalc: boolean;
  // The rule sets the app can run (S15g "Available editions list").
  available: readonly CodeEdition[];
};

export type CodeEditionPatch = { edition?: CompanyEditionDefault; optionalLoadCalc?: boolean };

export function settingsOf(tenantEdition: unknown, defaults: unknown): CodeEditionSettings {
  return {
    edition: companyDefault(tenantEdition),
    optionalLoadCalc: optionalLoadCalcOf(defaults),
    available: CODE_EDITIONS,
  };
}

// The PATCH body `{ edition?, optionalLoadCalc? }`: at least one, nothing else; null when refused.
export function parseCodeEditionPatch(body: unknown): CodeEditionPatch | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const keys = Object.keys(b);
  if (keys.length === 0 || keys.some((k) => k !== 'edition' && k !== 'optionalLoadCalc')) return null;
  const patch: CodeEditionPatch = {};
  if ('edition' in b) {
    if (!isCompanyEditionDefault(b.edition)) return null;
    patch.edition = b.edition;
  }
  if ('optionalLoadCalc' in b) {
    if (typeof b.optionalLoadCalc !== 'boolean') return null;
    patch.optionalLoadCalc = b.optionalLoadCalc;
  }
  return patch;
}
