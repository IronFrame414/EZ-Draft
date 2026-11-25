'use client';

// EZD-914 (S12 Layout "Standard editor shell ... rail shows Supplier markup active and omits Fixtures"; "Left panel:
// Supplier files list with Upload; source note"; 04 Tool rail "Mode rails (Ceiling, Detail, Reference, Supplier markup,
// Sheets) show their own tools plus Select, Check and Help"; Q-0781 no board for the empty screen): the Supplier markup
// screen at /projects/[id]/supplier. Its rail has Select (back to the plan) and Supplier markup, on; the left panel is
// the Supplier files panel. The tool bar, rendering and plan cards, inspector and the rest of the status bar come with
// EZD-917 onward (vault/build/assumptions.md EZD-914).
// EZD-1987 (audit F10; S12 board): the editor header card on top: wordmark back to Projects, the project name and
// client, and the view tabs with Plan on as a link back to the project's editor (vault/build/assumptions.md EZD-1987).
import { useState, type ReactElement } from 'react';
import { useT } from '../../../../../lib/messages';
import { EditorFrame } from '../../../../../components/shell/EditorFrame';
import { EditorHeader } from '../../../../../components/shell/EditorHeader';
import { HeaderCard } from '../../../../../components/shell/HeaderCard';
import { Wordmark } from '../../../../../components/shell/Wordmark';
import type { EditorView } from '../../../../../components/shell/editor-views';
import { StatusBar, StatusItem } from '../../../../../components/shell/StatusBar';
import { ToolRail } from '../../../../../components/shell/ToolRail';
import type { RailTool } from '../../../../../components/shell/rail-types';
import { SupplierFilesPanel, type SupplierFile } from '../../../../../components/supplier/SupplierFilesPanel';
import styles from './SupplierMarkupScreen.module.css';

const SELECT: RailTool = {
  kind: 'tool',
  id: 'select',
  icon: 'arrow_selector_tool',
  label: 'office.tool.select',
};
const SUPPLIER: RailTool = {
  kind: 'tool',
  id: 'supplier-markup',
  icon: 'photo_library',
  label: 'office.tool.supplier_markup',
};
// The tabs the editor always shows (3D waits for its plan canvas there); each one opens the project's editor.
const VIEWS: EditorView[] = ['plan', 'sheets'];

export function SupplierMarkupScreen({
  projectId,
  canUpload,
  project,
}: {
  projectId: string;
  canUpload: boolean;
  project: { name: string; clientName: string | null } | null;
}): ReactElement {
  const t = useT();
  const [open, setOpen] = useState<SupplierFile | null>(null);
  const projectHref = `/projects/${projectId}`;
  return (
    <EditorFrame
      header={
        project === null ? (
          <HeaderCard>
            <Wordmark href="/" />
          </HeaderCard>
        ) : (
          <EditorHeader
            projectsHref="/"
            projectName={project.name}
            subtitle={[project.clientName]}
            activeView="plan"
            views={VIEWS}
            activeHref={projectHref}
            onViewChange={() => window.location.assign(projectHref)}
          />
        )
      }
      rail={
        <ToolRail
          top={[SELECT, { kind: 'separator' }, SUPPLIER]}
          bottom={[]}
          activeId="supplier-markup"
          onSelect={(id) => {
            if (id === 'select') window.location.assign(projectHref);
          }}
        />
      }
      leftPanelLabel="office.shell.left_panel"
      leftPanel={<SupplierFilesPanel projectId={projectId} canUpload={canUpload} onOpen={setOpen} />}
      canvas={
        <div className={styles.canvas} data-testid="supplier-canvas">
          <p className={styles.hint}>{open ? open.originalName : t('office.supplier.canvas_hint')}</p>
        </div>
      }
      statusBar={
        <StatusBar
          start={<StatusItem label="office.ceiling.status.view">{t('office.tool.supplier_markup')}</StatusItem>}
        />
      }
    />
  );
}
