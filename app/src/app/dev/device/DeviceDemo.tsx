'use client';

import { useCallback, useMemo, useState } from 'react';
import { MessagesProvider, useT } from '../../../lib/messages';
import type { Language, Message } from '../../../lib/messages';
import type { MessageKey } from '../../../server/messages/catalog';
import {
  EditorFrame,
  EditorHeader,
  HeaderButton,
  StatusBar,
  ToolRail,
} from '../../../components/shell';
import type { EditorView, RailEntry, RailTool } from '../../../components/shell';
import { DeviceLayout } from '../../../components/device/DeviceLayout';
import { EditorPhoneNotice } from '../../../components/phone/EditorPhoneNotice';

const SUBTITLE = ['Sample client', 'Working copy', 'Saved just now'] as const;
const PHONE_SUBTITLE = ['Sample client', 'Working copy'] as const;

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

const noop = () => {};

export type DeviceDemoProps = {
  phoneLanguage: Language;
  phoneMessages: Readonly<Partial<Record<MessageKey, Message>>>;
};

export function DeviceDemo({ phoneLanguage, phoneMessages }: DeviceDemoProps) {
  const t = useT();
  const [activeView, setActiveView] = useState<EditorView>('plan');
  const [activeId, setActiveId] = useState<string | null>('select');
  const onViewChange = useCallback((view: EditorView) => setActiveView(view), []);
  const share = useMemo(
    () => <HeaderButton icon="share">{t('office.header.share')}</HeaderButton>,
    [t],
  );
  const exportSlot = useMemo(
    () => <HeaderButton icon="download">{t('office.header.export')}</HeaderButton>,
    [t],
  );
  const issueSet = useMemo(
    () => <HeaderButton variant="primary">{t('office.header.issue_set')}</HeaderButton>,
    [t],
  );
  const full = (
    <EditorFrame
      header={
        <EditorHeader
          projectsHref="/"
          projectName="Sample project"
          onProjectMenu={noop}
          subtitle={SUBTITLE}
          activeView={activeView}
          onViewChange={onViewChange}
          share={share}
          export={exportSlot}
          issueSet={issueSet}
        />
      }
      rail={<ToolRail top={TOP} bottom={BOTTOM} activeId={activeId} onSelect={setActiveId} />}
      leftPanelLabel="office.shell.left_panel"
      inspectorLabel="office.shell.inspector"
      statusBar={<StatusBar />}
    />
  );
  const phone = (
    <MessagesProvider language={phoneLanguage} messages={phoneMessages}>
      <EditorPhoneNotice title="Sample project" subtitle={PHONE_SUBTITLE} />
    </MessagesProvider>
  );
  return <DeviceLayout full={full} phone={phone} />;
}
