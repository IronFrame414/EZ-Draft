// EZD-233 (11 Budgets "editor before its lazy parts 500 KB"; ARCH Entry points and lazy modules): the context menu,
// the inspector More menu and the Save as group dialog with their commands, loaded through lazyModule when a menu
// first opens.
export { EditMenus, postSavedGroup } from './EditMenu';
export type { EditMenuRequest, EditMenusProps, SaveResult } from './EditMenu';
// EZD-301: the Upload files dialog for an existing project rides in this module so the editor gains no chunk entry.
export { UploadFilesDialog } from './UploadFilesDialog';
