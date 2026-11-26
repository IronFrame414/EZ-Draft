// EZD-717 (S13 Controls "Issue Rev n", Data shown "permit_revision: rev_no, issued_at, description" and "Title block:
// ... revisions table (no, date, description)"; 09h Revision rules "Rev 0 = first issued permit set, locked; later
// issues are Rev 1, 2... with no cap"; S13 Permissions "Issue Rev 0 permit set: Issue permit sets. Issue Rev 1+: Issue
// revisions"; board S13Sheets): the permit set's issued revisions, as the Sheets screen and the title block read
// them. Pure: browser and server.
import type { PermissionKey } from '../permissions/catalog';

// One issued revision (a permit_revision row) as the sheet-sets and issue answers carry it.
export type IssuedRevision = {
  id: string;
  revNo: number;
  // ISO time.
  issuedAt: string;
  description: string | null;
  modelVersionId: string;
  // The issue's PDF export job; null until it was recorded.
  exportJobId: string | null;
};

// The revision the next issue gives: 0 when none was issued, else one more than the highest (no cap).
export function nextRevision(revisions: readonly Pick<IssuedRevision, 'revNo'>[]): number {
  let max = -1;
  for (const r of revisions) if (r.revNo > max) max = r.revNo;
  return max + 1;
}

// The permission the next issue needs (S13 Permissions; the database function checks the same under its lock).
export function issuePermission(rev: number): PermissionKey {
  return rev === 0 ? 'issue_permit_sets' : 'issue_revisions';
}

// The newest issued revision, or null before Rev 0.
export function latestRevision<T extends Pick<IssuedRevision, 'revNo'>>(revisions: readonly T[]): T | null {
  let best: T | null = null;
  for (const r of revisions) if (best === null || r.revNo > best.revNo) best = r;
  return best;
}

// A revision's description as the title block and revision log print it. Rev 0 with none typed reads "Permit set"
// (board S13Sheets revision log and title block); a later one reads "Revision N" (vault/build/assumptions/EZD-717.md).
export function revisionDescription(r: Pick<IssuedRevision, 'revNo' | 'description'>): string {
  const typed = (r.description ?? '').trim();
  if (typed !== '') return typed;
  return r.revNo === 0 ? 'Permit set' : `Revision ${r.revNo}`;
}

// MM/DD/YY in the company's time zone is not known here; the date is the issue's UTC calendar day, as the PDF file
// name's date (server/jobs/pdf-export/file-name.ts) takes it.
export function revisionDate(issuedAt: string): string {
  const d = issuedAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
  return `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(2, 4)}`;
}

// The title block's revisions table: oldest first (board S13Sheets: 0, then 1).
export function titleBlockRevisionRows(
  revisions: readonly Pick<IssuedRevision, 'revNo' | 'issuedAt' | 'description'>[],
): { no: string; date: string; description: string }[] {
  return [...revisions]
    .sort((a, b) => a.revNo - b.revNo)
    .map((r) => ({ no: String(r.revNo), date: revisionDate(r.issuedAt), description: revisionDescription(r) }));
}
