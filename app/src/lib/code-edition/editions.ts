// EZD-613 (S15g; Q-0220; Q-0765; Q-0697 03 "Defaults data"; vault/build/assumptions.md EZD-613): the code
// editions the app knows, the company default and each project's effective edition. Browser and server.
// v1 has one edition, FBC 9th ed. with NEC 2023 (Q-0220; S15g Decision 1). EZD-643 adds FBC 8th ed. with
// NEC 2020 and the "By permit date (automatic)" choice (Q-0765). The migration holds the same list
// (20261119120000_create_code_edition.sql, private.is_code_edition; editions-sql.test.ts).
import type { MessageKey } from '../../server/messages/catalog';

export const CODE_EDITIONS = ['fbc9_nec2023'] as const;
export type CodeEdition = (typeof CODE_EDITIONS)[number];

// The edition when the company never picked one (tenant.code_edition null).
export const DEFAULT_CODE_EDITION: CodeEdition = 'fbc9_nec2023';

// The optional load-calc method default (S15g Electrical defaults; Round 24 #38), stored as a key of
// tenant.defaults. Off means the standard method only (assumptions EZD-615).
export const OPTIONAL_LOAD_CALC_KEY = 'optional_load_calc';
export const OPTIONAL_LOAD_CALC_DEFAULT = false;

export const editionLabel = (e: CodeEdition): MessageKey => `office.code_edition.edition.${e}`;

export function isCodeEdition(v: unknown): v is CodeEdition {
  return typeof v === 'string' && (CODE_EDITIONS as readonly string[]).includes(v);
}

// The company's default edition: its stored value, else the v1 edition.
export function companyEdition(tenantEdition: unknown): CodeEdition {
  return isCodeEdition(tenantEdition) ? tenantEdition : DEFAULT_CODE_EDITION;
}

// A project's edition: its own, else the company default (a project made before EZD-613, or never given one,
// reads the company default; assumptions EZD-613). A project with its own edition keeps it whatever the company
// default becomes (S15g Save; AC-EZD-613-1).
export function projectEdition(projectEdition: unknown, tenantEdition: unknown): CodeEdition {
  return isCodeEdition(projectEdition) ? projectEdition : companyEdition(tenantEdition);
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
  edition: CodeEdition;
  optionalLoadCalc: boolean;
  // The rule sets the app can run (S15g "Available editions list").
  available: readonly CodeEdition[];
};

export type CodeEditionPatch = { edition?: CodeEdition; optionalLoadCalc?: boolean };

export function settingsOf(tenantEdition: unknown, defaults: unknown): CodeEditionSettings {
  return {
    edition: companyEdition(tenantEdition),
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
    if (!isCodeEdition(b.edition)) return null;
    patch.edition = b.edition;
  }
  if ('optionalLoadCalc' in b) {
    if (typeof b.optionalLoadCalc !== 'boolean') return null;
    patch.optionalLoadCalc = b.optionalLoadCalc;
  }
  return patch;
}
