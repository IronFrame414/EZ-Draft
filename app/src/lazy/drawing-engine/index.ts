// EZD-423 (11 Budgets "editor before its lazy parts 500 KB"; 11 rule 7): the drawing engine, every drawing tool's
// code, loaded through lazyModule on the first pointer or key input in the editor, or when a tool is first asked
// for. Until then the entry's drawing shell (editor/tools/drawing-shell.ts) answers for it.
export { createDrawingController } from '../../editor/tools/drawing-controller';
