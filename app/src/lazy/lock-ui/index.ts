// EZD-126 (11 Budgets "editor before its lazy parts 500 KB"; 11 rule 7; ARCH Entry points and lazy modules): the
// edit lock UI, its store and the Realtime join behind it, loaded through lazyModule on the first user input in
// the editor (vault/build/assumptions.md EZD-126).
export { createLockUi } from '../../editor/lock-ui/use-lock-ui';
export { LockPart, type LockPartName, type LockUi } from '../../editor/lock-ui/LockUi';
