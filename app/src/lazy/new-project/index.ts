// EZD-1999 (performance audit 2026-11-26 F10, Q-0814; 11 Performance rule 7 "Load code on first use"): the New project
// wizard and its parts, loaded through lazyModule when New project is opened (components/projects/NewProjectLoader.tsx),
// so the Projects page's first download does not carry them.
export { NewProjectDialog, type NewProjectDialogProps } from '../../components/projects/NewProjectDialog';
