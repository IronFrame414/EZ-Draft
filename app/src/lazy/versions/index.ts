// EZD-1910 (editor plan L4; EZD-120c B11): the Versions tab, the version inspector, the status text and the diff layer
// load through this lazy folder, so the entry contents check sees them as lazy code (EZD-122: loaded when the tab
// first opens).
export { DiffLayer, VersionInspector, VersionsPanel, VersionsStatus } from '../../editor/versions/VersionsPanel';
export type {
  VersionInspectorProps,
  VersionsPanelProps,
  VersionsStatusProps,
} from '../../editor/versions/VersionsPanel';
// EZD-123: the version cleanup sheet loads with the same module, when a project with due rows opens.
export { CleanupSheet, type CleanupSheetProps } from '../../editor/versions/CleanupSheet';
