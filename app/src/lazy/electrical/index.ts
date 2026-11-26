// EZD-1910 (editor plan L4; EZD-120c B11): electrical mode's left panel, device toolbar and status items load through
// this lazy folder, so the entry contents check sees them as lazy code (EZD-601: one chunk, loaded when the Electrical
// tool is first turned on).
export { DeviceTools, ElectricalPanel, ElectricalStatus } from '../../editor/electrical';
export type { DeviceToolsProps, ElectricalPanelProps, ToolBase } from '../../editor/electrical';
