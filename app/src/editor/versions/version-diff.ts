// EZD-139 (Q-0220; Q-0700 05 "Visual diff"; 09p Visual diff; AC-EZD-139-2, -3): the opened old version against the
// working copy, by object id. Same id with different data is changed; in the old version only is removed since; in
// the working copy only is added since. EZD-123 moved the code to app/src/lib/versions/version-diff.ts, so the server
// can count a cleanup row against its parent the same way; the editor keeps importing it from here.
export {
  NO_DIFF,
  sameObject,
  versionDiff,
  type VersionDiff,
} from '../../lib/versions/version-diff';
