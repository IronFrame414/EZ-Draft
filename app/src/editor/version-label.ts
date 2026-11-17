// EZD-121 (Q-0700 05 row "Versions labels"; R24 #26; S20 Version rules; board S03 / S20): the editor header's
// version text. Client sends before the permit are "Version N"; permit issues are "Rev N" (EZD-717 issues them,
// so the Rev forms are built here but nothing passes a rev until then).
//   nothing sent                      -> Working copy
//   newest send is Version N          -> Working copy · Version N sent
//   newest issue is Rev N             -> Working copy · Rev N issued
//   a sent version open read-only     -> Version N (or Rev N)
export type SentRef = { kind: 'version' | 'rev'; no: number };

export type VersionLabelState = {
  // The newest sent version or permit issue; null before any.
  lastSent: SentRef | null;
  // A sent version open read-only on the canvas (EZD-122 opens it); null on the working copy.
  viewing?: SentRef | null;
};

export type VersionLabelKey =
  | 'office.editor.working_copy'
  | 'office.editor.working_copy_version_sent'
  | 'office.editor.working_copy_rev_issued'
  | 'office.editor.version'
  | 'office.editor.rev';

export function versionLabel(state: VersionLabelState): {
  key: VersionLabelKey;
  params?: { n: number };
} {
  const viewing = state.viewing ?? null;
  if (viewing !== null) {
    return {
      key: viewing.kind === 'rev' ? 'office.editor.rev' : 'office.editor.version',
      params: { n: viewing.no },
    };
  }
  const last = state.lastSent;
  if (last === null) return { key: 'office.editor.working_copy' };
  return {
    key:
      last.kind === 'rev'
        ? 'office.editor.working_copy_rev_issued'
        : 'office.editor.working_copy_version_sent',
    params: { n: last.no },
  };
}

// The newer of two client-send numbers; a broadcast or a send response never lowers what is shown.
export function newerVersionNo(current: number | null, next: number | null): number | null {
  if (next === null) return current;
  if (current === null) return next;
  return Math.max(current, next);
}
