// EZD-215 (11 Budgets; EZD-120c B11 editor route budget): the confirm dialog and its Radix AlertDialog, loaded through
// lazyModule when the first confirm is asked (components/states/ConfirmProvider.tsx), so the editor's and the office's
// first download do not carry them.
export { ConfirmDialog, type ConfirmDialogProps } from '../../components/states/ConfirmDialog';
