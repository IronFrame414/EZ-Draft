'use client';
import { useState } from 'react';
import { EditorFrame, HeaderCard, StatusBar, ToolRail } from '../../../../components/shell';
import type { RailEntry, RailTool } from '../../../../components/shell';

const TOP: RailEntry[] = [
  {
    kind: 'tool',
    id: 'select',
    icon: 'arrow_selector_tool',
    label: 'office.tool.select',
    shortcut: 'V',
  },
  { kind: 'separator' },
  { kind: 'tool', id: 'cabinets', icon: 'kitchen', label: 'office.tool.cabinets', shortcut: 'C' },
];

const BOTTOM: RailTool[] = [
  { kind: 'tool', id: 'help', icon: 'help', label: 'office.tool.help', shortcut: '?' },
];

export function SampleRail() {
  const [activeId, setActiveId] = useState<string | null>('select');
  return (
    <EditorFrame
      header={<HeaderCard />}
      rail={<ToolRail top={TOP} bottom={BOTTOM} activeId={activeId} onSelect={setActiveId} />}
      leftPanelLabel="office.shell.left_panel"
      inspectorLabel="office.shell.inspector"
      statusBar={<StatusBar />}
    />
  );
}
