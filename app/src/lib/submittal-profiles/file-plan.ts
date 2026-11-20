// EZD-713 (S15c File split, File naming pattern, Revision naming, Resubmittal mode; 08 Department submittal rules,
// settings 1, 2, 3 and 8): the files an export makes for a sheet set under a submittal profile, and their names.
// Pure; the PDF export (EZD-715, EZD-727) renders the files. Browser and server.
//
// - Split: combined set = one file; per discipline or consultant = one file per discipline, in the order the set
//   first shows it; one PDF per sheet = one file per sheet, in set order.
// - Names: the profile's template with {address} {description} {rev} {date} {sheet} {discipline}; the characters
//   / ? < > \ : * | " , # and double or trailing spaces are stripped (S15c); ALL CAPS when the profile says so; the
//   profile's length limit counts the whole name with ".pdf" (board "33 / 80"). A per-sheet or per-discipline file
//   whose template has no {sheet} or {discipline} gets the sheet number or discipline added at the end, so every
//   file has its own name (assumptions EZD-713).
// - Revision naming: "Version in file name" fills {rev}; "Same name as original" leaves it empty (the revision ID
//   is only in the title and revision blocks) and a resubmittal keeps the name each file had in the original
//   submittal (08: "every department that addresses resubmittals requires the corrected file to keep its original
//   name").
// - Resubmittal mode "Changed sheets only": a resubmittal holds only the changed sheets.
// The max file size is applied by the export, which knows each file's size (assumptions EZD-713).
import { fileName, type SubmittalProfile } from './profiles';

export { fileName, type NameOptions } from './profiles';

export type PlanSheet = {
  // The sheet number, e.g. "A1.0".
  number: string;
  // The discipline or consultant the sheet belongs to, e.g. "Architectural".
  discipline: string;
};

export type PlanValues = {
  address: string;
  description: string;
  // The revision ID as it prints, e.g. "Rev 1".
  rev: string;
  date: string;
};

export type PlannedFile = {
  // What the file holds: "combined", the discipline, or the sheet number. A resubmittal matches files by it.
  key: string;
  name: string;
  sheets: string[];
};

export type PlanProfile = Pick<
  SubmittalProfile,
  | 'fileSplit'
  | 'namingTemplate'
  | 'namingMaxLength'
  | 'namingUpper'
  | 'revisionNaming'
  | 'resubmittalMode'
>;

export type Resubmittal = {
  // The files of the original submittal.
  original: readonly PlannedFile[];
  // The sheet numbers changed since then; under "Changed sheets only" the resubmittal holds just these.
  changed?: readonly string[];
};

type Group = { key: string; sheets: PlanSheet[]; sheet: string; discipline: string };

function groups(split: PlanProfile['fileSplit'], sheets: readonly PlanSheet[]): Group[] {
  if (split === 'combined')
    return sheets.length === 0
      ? []
      : [{ key: 'combined', sheets: [...sheets], sheet: '', discipline: '' }];
  if (split === 'per_sheet')
    return sheets.map((s) => ({
      key: s.number,
      sheets: [s],
      sheet: s.number,
      discipline: s.discipline,
    }));
  const out: Group[] = [];
  for (const s of sheets) {
    const g = out.find((x) => x.key === s.discipline);
    if (g) g.sheets.push(s);
    else out.push({ key: s.discipline, sheets: [s], sheet: '', discipline: s.discipline });
  }
  return out;
}

// The files of one submittal (or, with `resubmittal`, of a resubmittal) in order.
export function planFiles(
  profile: PlanProfile,
  sheets: readonly PlanSheet[],
  values: PlanValues,
  resubmittal?: Resubmittal,
): PlannedFile[] {
  const changed = resubmittal?.changed ? new Set(resubmittal.changed) : null;
  const included =
    resubmittal && changed && profile.resubmittalMode === 'changed_sheets'
      ? sheets.filter((s) => changed.has(s.number))
      : sheets;
  const sameName = profile.revisionNaming === 'same_name';
  const template = profile.namingTemplate;
  const needs =
    profile.fileSplit === 'per_sheet'
      ? '{sheet}'
      : profile.fileSplit === 'per_discipline'
        ? '{discipline}'
        : null;
  const opts = { upper: profile.namingUpper, maxLength: profile.namingMaxLength };
  const original = new Map((resubmittal?.original ?? []).map((f) => [f.key, f.name]));

  return groups(profile.fileSplit, included).map((g) => {
    const kept = sameName ? original.get(g.key) : undefined;
    const tokens = {
      address: values.address,
      description: values.description,
      rev: sameName ? '' : values.rev,
      date: values.date,
      sheet: g.sheet,
      discipline: g.discipline,
    };
    const name =
      kept ??
      fileName(template, tokens, {
        ...opts,
        ...(needs !== null && !template.includes(needs)
          ? { suffix: needs === '{sheet}' ? g.sheet : g.discipline }
          : {}),
      });
    return { key: g.key, name, sheets: g.sheets.map((s) => s.number) };
  });
}
