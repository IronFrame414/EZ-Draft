'use client';
// EZD-1404 (S17 Layout "Phone 390x844. Not the editor shell"; Controls "Revision badge", "Project title / subtitle",
// "Room chips", "Tab: Plan / 3D / Measure / Tasks / Photo"; States "No set sent yet"; board S17Field): the field
// pack's phone shell. Header: offline icon and revision badge (tap shows the revision note and date), project title,
// subtitle "Field pack · issued <date> · A3.0 Proposed plan" (S17 Decision 9), room chips with All; tab bar Plan,
// 3D, Measure, Tasks (open count), Photo (hidden without Photo notes). No Back to EZ Binder in v1 (Q-0190, Q-0401).
// The tab contents are EZD-1405 (Plan, 3D), EZD-1406 (Measure), EZD-1409 (Tasks) and EZD-1410 (Photo).
// EZD-1409: the Tasks tab (TasksPanel) shows the pack's tasks with this phone's checks, photos and edits laid over
// them (tasks-view.ts); the tab badge counts the open ones.
import { useId, useState, type ReactNode } from 'react';
import { Disclaimer } from '../components/disclaimer/Disclaimer';
import { Icon } from '../components/icon/Icon';
import { PhoneFrame } from '../components/phone/PhoneFrame';
import { PhoneHeader } from '../components/phone/PhoneHeader';
import { useT } from '../lib/messages';
import type { Language } from '../lib/messages/types';
import type { FieldPackView as PackData } from './types';
import { ALL_ROOMS, packDate, packTitle, packTabs, type FieldPackTab } from './pack-view';
import { NO_OVERLAY, openCount, overlayTasks, type TaskOverlay } from './tasks-view';
import { TasksPanel, type TaskActions } from './TasksPanel';
import styles from './FieldPack.module.css';

const TAB_ICON: Record<FieldPackTab, Parameters<typeof Icon>[0]['name']> = {
  plan: 'grid_on',
  '3d': 'category',
  measure: 'straighten',
  tasks: 'assignment',
  photo: 'photo_camera',
};

export function FieldPackView({
  data,
  language,
  canPhoto,
  icon,
  initialTab = 'plan',
  initialRoom = ALL_ROOMS,
  overlay = NO_OVERLAY,
  taskActions = null,
  senderFailed = false,
}: {
  data: PackData;
  language: Language;
  canPhoto: boolean;
  // The header's offline status icon.
  icon?: ReactNode;
  initialTab?: FieldPackTab;
  initialRoom?: string;
  overlay?: TaskOverlay;
  // The task row controls; null shows the tasks with no controls.
  taskActions?: TaskActions | null;
  // EZD-2025 (AC-EZD-2025-4): the field sender could not start; the Tasks tab says why its controls are missing.
  senderFailed?: boolean;
}) {
  const t = useT();
  const [tab, setTab] = useState<FieldPackTab>(initialTab);
  const [room, setRoom] = useState(initialRoom);
  const [noteOpen, setNoteOpen] = useState(false);
  const panelId = useId();
  const pack = data.pack;
  const title = packTitle(data.projectName, data.clientName);

  if (pack === null) {
    return (
      <PhoneFrame header={<PhoneHeader title={title} end={icon} />}>
        <div className={styles.empty} data-testid="field-pack" data-state="none">
          <p className={styles.emptyText}>{t('field.pack.none')}</p>
        </div>
        <Disclaimer placement="page" />
      </PhoneFrame>
    );
  }

  const revision = pack.revision;
  const badge =
    revision === null ? null : (
      <button
        type="button"
        className={styles.badge}
        aria-expanded={noteOpen}
        data-testid="revision-badge"
        onClick={() => setNoteOpen((o) => !o)}
      >
        {t(revision.kind === 'rev' ? 'field.pack.rev' : 'field.pack.version', { n: revision.no })}
      </button>
    );
  const tasks = overlayTasks(pack.tasks ?? [], overlay);
  const open = pack.tasks === undefined ? pack.openTasks : openCount(tasks);
  const tabs = packTabs({ canPhoto });
  const current = tabs.includes(tab) ? tab : 'plan';

  return (
    <PhoneFrame
      header={
        <PhoneHeader
          title={title}
          subtitle={[
            t('field.pack.label'),
            t('field.pack.issued', { date: packDate(pack.issuedAt, language, false) }),
            t('field.pack.sheet_default'),
          ]}
          end={
            <span className={styles.headerEnd}>
              {icon}
              {badge}
            </span>
          }
          below={
            <>
              {noteOpen ? (
                <div className={styles.note} role="note" data-testid="revision-note">
                  <p className={styles.noteDate}>
                    {t('field.pack.revision_issued', {
                      date: packDate(pack.issuedAt, language, true),
                    })}
                  </p>
                  <p className={styles.noteText}>{pack.note ?? t('field.pack.revision_no_note')}</p>
                </div>
              ) : null}
              <div className={styles.chips} role="group" aria-label={t('field.pack.rooms')}>
                {[{ id: ALL_ROOMS, name: t('field.pack.all_rooms') }, ...pack.rooms].map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={r.id === room ? `${styles.chip} ${styles.chipOn}` : styles.chip}
                    aria-pressed={r.id === room}
                    data-room={r.id}
                    onClick={() => setRoom(r.id)}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            </>
          }
        />
      }
      footer={
        <nav
          className={styles.tabBar}
          role="tablist"
          aria-label={t('field.pack.tabs')}
          onKeyDown={(e) => {
            // Audit 2026-11-27 A13 (WAI-ARIA tabs): arrows move to the next tab and open it; Home and End go to the ends.
            const at = tabs.indexOf(current);
            const to =
              e.key === 'ArrowRight'
                ? (at + 1) % tabs.length
                : e.key === 'ArrowLeft'
                  ? (at - 1 + tabs.length) % tabs.length
                  : e.key === 'Home'
                    ? 0
                    : e.key === 'End'
                      ? tabs.length - 1
                      : null;
            if (to === null) return;
            e.preventDefault();
            const next = tabs[to] as FieldPackTab;
            setTab(next);
            e.currentTarget.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus();
          }}
        >
          {tabs.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={k === current}
              aria-controls={panelId}
              tabIndex={k === current ? 0 : -1}
              // Audit 2026-11-27 A13: the open-task count is part of the tab's name.
              aria-label={
                k === 'tasks' && open > 0 ? t('field.pack.tasks_tab_open', { count: open }) : undefined
              }
              className={k === current ? `${styles.tab} ${styles.tabOn}` : styles.tab}
              data-tab={k}
              onClick={() => setTab(k)}
            >
              <span className={styles.tabIcon}>
                <Icon name={TAB_ICON[k]} size={22} />
                {k === 'tasks' && open > 0 ? (
                  <span className={styles.count} data-testid="open-tasks" aria-hidden="true">
                    {open}
                  </span>
                ) : null}
              </span>
              {t(`field.pack.tab.${k}`)}
            </button>
          ))}
        </nav>
      }
    >
      <section
        className={styles.panel}
        role="tabpanel"
        id={panelId}
        aria-label={t(`field.pack.tab.${current}`)}
        data-testid="field-pack"
        data-state="ready"
        data-tab={current}
        data-room={room}
      >
        {current === 'tasks' ? (
          <TasksPanel
            tasks={tasks}
            room={room}
            language={language}
            canPhoto={canPhoto}
            actions={taskActions}
            senderFailed={senderFailed}
          />
        ) : null}
      </section>
      <Disclaimer placement="page" />
    </PhoneFrame>
  );
}
