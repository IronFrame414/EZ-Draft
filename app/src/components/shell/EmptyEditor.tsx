'use client';
// The empty Studio editor: no tools exist in Phase 0 (vault/plans/EZD-012b.md Step 3).
// Under 1024 px it shows the phone notice instead (vault/plans/EZD-014a.md Step 8).
import type { ReactNode } from 'react';
import { DeviceLayout } from '../device/DeviceLayout';
import { EditorPhoneNotice } from '../phone/EditorPhoneNotice';
import { EditorFrame } from './EditorFrame';
import { StatusBar } from './StatusBar';
import { ToolRail } from './ToolRail';
import type { RailEntry, RailTool } from './rail-types';

const NO_ENTRIES: RailEntry[] = [];
const NO_TOOLS: RailTool[] = [];
const noop = () => {};

export function EmptyEditor({ header, phone }: { header?: ReactNode; phone?: ReactNode }) {
  return (
    <DeviceLayout
      full={
        <EditorFrame
          header={header}
          rail={<ToolRail top={NO_ENTRIES} bottom={NO_TOOLS} activeId={null} onSelect={noop} />}
          leftPanelLabel="office.shell.left_panel"
          inspectorLabel="office.shell.inspector"
          statusBar={<StatusBar />}
        />
      }
      phone={phone ?? <EditorPhoneNotice />}
    />
  );
}
