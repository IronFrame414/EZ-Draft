// EZD-715 (08 Exports "File name": address + description, e.g. "336 Golfview Rd buildingplans"; the version stays in
// the file name by default (Round 25) and a profile can switch to same-name-as-original; naming template, file split
// set per submittal profile; S15c File naming pattern default "{address} {description}" "with the version kept in the
// name"; AC-EZD-715-2): the files one export run writes and their names. The EZD-713 file plan does the split and the
// template; this adds what the export decides:
//
// - Version kept by default: under "Version in file name" a template without {rev} gets " {rev}" at the end, so the
//   default template names "336 Golfview Rd buildingplans Rev 0.pdf" (board S15c "[Address] buildingplans Rev
//   1.pdf"). A one-PDF-per-sheet file puts its sheet number before the version ("… buildingplans A1.0 Rev 0.pdf",
//   vault/build/assumptions/EZD-723.md), as a per-discipline file puts its discipline.
// - The one-PDF-per-set and one-PDF-per-sheet outputs come from the same run: `split` overrides the profile's split
//   ('set' one file, 'sheet' one file per sheet); absent, the profile's split applies.
// - A project with no profile names files as the S15c defaults (vault/build/assumptions/EZD-715.md).
import type { SheetSetKind } from '@ezdraft/geometry';
import {
  planFiles,
  type PlanProfile,
  type PlanSheet,
  type PlanValues,
  type PlannedFile,
} from '../../../lib/submittal-profiles/file-plan';
import type { SheetGroup } from '../../../lib/sheets/sheet-set';

export const EXPORT_SPLITS = ['set', 'sheet'] as const;
export type ExportSplit = (typeof EXPORT_SPLITS)[number];

// The S15c defaults of a new profile (EZD-712): combined set, "{address} {description}", version in the file name.
export const DEFAULT_PLAN_PROFILE: PlanProfile = {
  fileSplit: 'combined',
  namingTemplate: '{address} {description}',
  namingMaxLength: null,
  namingUpper: false,
  revisionNaming: 'version_in_name',
  resubmittalMode: 'changed_sheets',
};

// {description}: what the set is. The permit set is "buildingplans" (08 File name); the client set "clientset"
// (vault/build/assumptions/EZD-715.md, wording for Josh).
export const SET_DESCRIPTION: Readonly<Record<SheetSetKind, string>> = {
  permit: 'buildingplans',
  client: 'clientset',
};

// {rev}: "Rev 0" for the first issue, then "Rev 1", "Rev 2" (S13 Validation "Numbering"; board S15c "Rev 1").
export const revisionToken = (rev: number): string => `Rev ${rev}`;

// {discipline}: the sheet list group as a word (S13 Layout: Architectural / Electrical / Renderings).
export const DISCIPLINE: Readonly<Record<SheetGroup, string>> = {
  architectural: 'Architectural',
  electrical: 'Electrical',
  renderings: 'Renderings',
};

// The profile as this run applies it: the split chosen, and the template with the version (and the sheet or the
// discipline before it) added when the version is kept in the name and the template leaves it out.
export function exportProfile(profile: PlanProfile, split?: ExportSplit): PlanProfile {
  const fileSplit = split === 'sheet' ? 'per_sheet' : split === 'set' ? 'combined' : profile.fileSplit;
  let template = profile.namingTemplate.trim();
  if (profile.revisionNaming === 'version_in_name' && !template.includes('{rev}')) {
    if (fileSplit === 'per_sheet' && !template.includes('{sheet}')) template += ' {sheet}';
    if (fileSplit === 'per_discipline' && !template.includes('{discipline}')) template += ' {discipline}';
    template += ' {rev}';
  }
  return { ...profile, fileSplit, namingTemplate: template };
}

export function exportFiles(
  profile: PlanProfile | null,
  sheets: readonly PlanSheet[],
  values: PlanValues,
  split?: ExportSplit,
): PlannedFile[] {
  return planFiles(exportProfile(profile ?? DEFAULT_PLAN_PROFILE, split), sheets, values);
}
