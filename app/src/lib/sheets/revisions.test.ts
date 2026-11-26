// EZD-717 (09h Revision rules "Rev 0 = first issued permit set ... later issues are Rev 1, 2... with no cap"; S13
// Permissions "Issue Rev 0 permit set: Issue permit sets. Issue Rev 1+: Issue revisions"; S13 Validation "Numbering";
// board S13Sheets title block revisions "0 | 09/29/26 | Permit set" and status bar "Rev 1 draft").
import { describe, expect, it } from 'vitest';
import { draftRevision } from './sheet-set';
import {
  issuePermission,
  latestRevision,
  nextRevision,
  revisionDate,
  revisionDescription,
  titleBlockRevisionRows,
} from './revisions';

const rev = (revNo: number, issuedAt = '2026-09-29T14:00:00Z', description: string | null = null) => ({
  id: `r${revNo}`,
  revNo,
  issuedAt,
  description,
  modelVersionId: `v${revNo}`,
  exportJobId: null,
});

describe('EZD-717 revision numbering', () => {
  it('the first issue is Rev 0, then Rev 1, 2 ... with no cap', () => {
    expect(nextRevision([])).toBe(0);
    expect(nextRevision([rev(0)])).toBe(1);
    expect(nextRevision([rev(0), rev(1)])).toBe(2);
    expect(nextRevision(Array.from({ length: 150 }, (_, i) => rev(i)))).toBe(150);
  });

  it('Rev 0 needs Issue permit sets; Rev 1+ needs Issue revisions', () => {
    expect(issuePermission(0)).toBe('issue_permit_sets');
    expect(issuePermission(1)).toBe('issue_revisions');
    expect(issuePermission(12)).toBe('issue_revisions');
  });

  it('the newest revision is the highest number', () => {
    expect(latestRevision([])).toBeNull();
    expect(latestRevision([rev(1), rev(0)])?.revNo).toBe(1);
  });

  it('a set drafts Rev 0 until issued and the next revision after (board "Rev 1 draft" after Rev 0)', () => {
    expect(draftRevision({ lastIssuedVersionId: null })).toBe(0);
    expect(draftRevision({ lastIssuedVersionId: null, revisions: [] })).toBe(0);
    expect(draftRevision({ lastIssuedVersionId: 'v0', revisions: [rev(0)] })).toBe(1);
    // An issued set whose revisions are not known reads no number.
    expect(draftRevision({ lastIssuedVersionId: 'v0' })).toBeNull();
  });
});

describe('EZD-717 title block revisions table', () => {
  it('prints no, MM/DD/YY and description, oldest first (board S13Sheets "0 | 09/29/26 | Permit set")', () => {
    expect(titleBlockRevisionRows([rev(1, '2026-10-11T15:00:00Z', 'Back run scribe'), rev(0)])).toEqual([
      { no: '0', date: '09/29/26', description: 'Permit set' },
      { no: '1', date: '10/11/26', description: 'Back run scribe' },
    ]);
    expect(titleBlockRevisionRows([])).toEqual([]);
  });

  it('a revision with no description reads "Permit set" for Rev 0 and "Revision N" after', () => {
    expect(revisionDescription({ revNo: 0, description: null })).toBe('Permit set');
    expect(revisionDescription({ revNo: 2, description: '  ' })).toBe('Revision 2');
    expect(revisionDescription({ revNo: 2, description: 'Island moved' })).toBe('Island moved');
  });

  it('a date that is not ISO prints empty', () => {
    expect(revisionDate('nope')).toBe('');
  });
});
