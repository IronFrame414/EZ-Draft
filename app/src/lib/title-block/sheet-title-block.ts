// EZD-710 (S13 Data shown "Title block", Decisions 5, 6, 7, 10; S15b Decisions 1-3; 09h "Title block"; Q-0182;
// AC-EZD-710-1): what each sheet's title block prints. The project part (company, project, address, owner, parcel,
// code edition, scope of work, drawn by) is read once per project by the server (server/title-block/
// sheet-title-block.ts) and sent with the sheet sets; the sheet part (title, number, revision, scale, sheet x of y,
// stamp areas) comes from the open sheet and its set. Permit sheets are English only (S13 Decision 7), so these are
// sheet words, not catalog messages (as draftWatermark). Pure: browser and server.
import type { TitleBlockValues } from '@ezdraft/geometry';
import {
  draftRevision,
  sheetPosition,
  sheetShowsPlan,
  type Sheet,
  type SheetSetSummary,
} from '../sheets/sheet-set';
import type { CompanyContact } from '../company/company';
import { missingTitleBlockFields, type TitleBlockField } from './title-block';

// The project's title block, the same on every sheet. Null text is not filled.
export type ProjectTitleBlock = {
  // The company block (S15b switch "Show company logo, license and contact"); null when switched off.
  company: { name: string; licenseNo: string | null; contact: CompanyContact; logoUrl: string | null } | null;
  // Company name and license for the completeness check, whatever the switch (S15b Decision 2).
  companyName: string | null;
  licenseNo: string | null;
  projectName: string;
  address: string | null;
  // The project's effective code edition in sheet words (S06 "FBC 9th ed. · NEC 2023").
  codeEdition: string | null;
  scopeOfWork: string | null;
  // From the project's property record (S13 "From property appraiser link"; EZD-711 imports it).
  owner: string | null;
  parcel: string | null;
  // The signed-in user's initials until a set is issued (board S15b "Drawn by uses the issuing user's initials").
  drawn: string;
};

// S15b Decision 2: the fields of a complete title block that this project lacks, in that order.
export function projectTitleBlockMissing(tb: ProjectTitleBlock): TitleBlockField[] {
  return missingTitleBlockFields({
    company_name: tb.companyName,
    license_number: tb.licenseNo,
    project_address: tb.address,
    parcel_number: tb.parcel,
    owner: tb.owner,
    scope_of_work: tb.scopeOfWork,
    code_edition: tb.codeEdition,
  });
}

// The board's sheet date: MM/DD/YY (S13Sheets "10/11/26").
export function sheetDate(d: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getMonth() + 1)}/${two(d.getDate())}/${two(d.getFullYear() % 100)}`;
}

// The plan sheets draw at 1/4" = 1'-0" (EZD-702b); other sheets read "AS NOTED" (board S13Sheets).
// EZD-703: given the sheet's viewport scale (lib/sheets/viewport.ts sheetScaleLabel), the block prints it; a sheet with
// no viewport (null) reads AS NOTED.
export const PLAN_SCALE_TEXT = '1/4" = 1\'-0"';
export const AS_NOTED = 'AS NOTED';

const text = (v: string | null | undefined): string => (v ?? '').trim();

export function sheetTitleBlockValues(
  tb: ProjectTitleBlock,
  set: Pick<SheetSetSummary, 'kind' | 'sheets' | 'lastIssuedVersionId'>,
  sheet: Pick<Sheet, 'number' | 'title'>,
  today: Date,
  scale?: string | null,
): TitleBlockValues {
  const pos = sheetPosition(set.sheets, sheet.number);
  const rev = draftRevision(set);
  const c = tb.company;
  return {
    company:
      c === null
        ? null
        : {
            name: text(c.name),
            license: text(c.licenseNo),
            contact: [c.contact.phone, c.contact.email, c.contact.website].map(text).filter((v) => v !== ''),
            logoUrl: c.logoUrl,
          },
    projectName: text(tb.projectName),
    address: text(tb.address),
    codeEdition: text(tb.codeEdition),
    scopeOfWork: text(tb.scopeOfWork),
    owner: text(tb.owner),
    parcel: text(tb.parcel),
    // Issued revisions fill the table with EZD-717; a draft set has none yet.
    revisions: [],
    stampAreas: set.kind === 'permit',
    drawn: tb.drawn,
    checked: '',
    date: sheetDate(today),
    scale: scale !== undefined ? (scale ?? AS_NOTED) : sheetShowsPlan(sheet) ? PLAN_SCALE_TEXT : AS_NOTED,
    sheetTitle: sheet.title,
    sheetNumber: sheet.number,
    revision: rev === null ? '' : `REV ${rev}`,
    sheetOf: pos === null ? '' : `${pos.index} OF ${pos.of}`,
  };
}
