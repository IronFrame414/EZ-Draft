// EZD-729 (11 Budgets "editor before its lazy parts 500 KB"; ARCH Entry points and lazy modules): the Rooms tab's room
// fields and their edit, loaded through `roomFieldsModule` in LeftPanel.tsx when the Rooms tab is first opened.
export { RoomFields } from '../../editor/layers/RoomFields';
// EZD-229 (AC-EZD-229-1, -2): the plan marks of the existing details and the floor transitions, loaded by the plan
// controller through the same module (editor/layers/room-fields-module.ts `roomFieldsModule`).
export { planDetailItems } from './details-drawing';
