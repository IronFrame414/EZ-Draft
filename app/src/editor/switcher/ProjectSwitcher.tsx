'use client';
// EZD-128 Build step 9 (vault/plans/EZD-128.md section 3 props, hook and data-testid rows; Decided "Rows are
// links", "Panel placement", "Panel listeners", "Focus", "Busy row", "Leave failed", "List states", "Editor
// wiring"; 04 Header card "Project name + chevron · Opens project switcher (recent projects, search)"; S01 Entry
// points "Back to projects"; Q-0697 decisions 04; Q-0698; Q-0726; Q-0214): the header project name's menu.
//
// `ProjectSwitcherPanel` is the panel alone (server-renderable: no portal, no effects); `ProjectSwitcher` puts it
// in a portal below the name button (the header card clips its children) and closes it on Escape, a press or
// focus outside, and a window resize, never while a leave runs. Project settings is EZD-130's item, after Back
// to projects (P128 section 3 "For dependents"; glossary 00i "Project switcher"); it closes the panel and opens
// the dialog, which loads with this module. Loaded with
// the lock UI's lazy module (app/src/lazy/lock-ui), which the editor loads on the first user input.
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent,
  type ReactElement,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { InlineError } from '../../components/states/InlineError';
import { Skeleton, SkeletonGroup } from '../../components/states/Skeleton';
import { useT } from '../../lib/messages';
import { PROJECT_SEARCH_MAX } from '../../lib/projects/projects';
import type { ThumbnailCapture } from '../../lib/thumbnail/thumbnail';
import type { ProjectSettings } from '../../lib/projects/project-settings';
import {
  ProjectSettingsDialog,
  type ProjectSettingsDialogProps,
} from '../../components/projects/ProjectSettingsDialog';
import touch from '../../styles/touch.module.css';
import type { EditorSession } from '../editor-session';
import {
  createSwitcherStore,
  leaveProject,
  projectHref,
  PROJECTS_HREF,
  switcherHttpApi,
  type LeaveTarget,
  type SwitcherState,
  type SwitcherStore,
} from './switcher-store';
import styles from './ProjectSwitcher.module.css';

export type ProjectSwitcherPanelProps = {
  state: SwitcherState;
  store: Pick<SwitcherStore, 'setQuery' | 'retryList' | 'pick' | 'backToProjects' | 'retryLeave'>;
  panelId: string;
  maxHeight?: string;
  panelRef?: RefObject<HTMLDivElement | null>;
  style?: CSSProperties;
  // EZD-130: opens Project settings; no item without it.
  onSettings?: () => void;
};

const sameTarget = (a: LeaveTarget, b: LeaveTarget): boolean =>
  a.kind === b.kind &&
  (a.kind === 'projects' ||
    (b.kind === 'project' && a.projectId.toLowerCase() === b.projectId.toLowerCase()));

// A primary click with no modifier leaves through the store; any other click keeps the browser default (a new tab
// keeps this tab's lock).
const plainClick = (e: MouseEvent): boolean =>
  e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

export function ProjectSwitcherPanel({
  state,
  store,
  panelId,
  maxHeight,
  panelRef,
  style,
  onSettings,
}: ProjectSwitcherPanelProps): ReactElement {
  const t = useT();
  const leaving = state.leaving;
  const busy = leaving.status === 'busy';
  const busyOn = (target: LeaveTarget) => busy && sameTarget(leaving.target, target);
  const list = state.list;

  let content: ReactElement;
  if (list.status === 'loading') {
    content = (
      <div className={styles.loading} data-testid="project-switcher-loading">
        <SkeletonGroup count={3}>
          <div className={styles.item}>
            <Skeleton height="14px" />
          </div>
        </SkeletonGroup>
      </div>
    );
  } else if (list.status === 'failed') {
    content = (
      <div data-testid="project-switcher-error">
        <InlineError message="office.projects.load_error" onRetry={() => store.retryList()} />
      </div>
    );
  } else if (list.items.length === 0) {
    content =
      state.mode === 'search' ? (
        <p className={styles.line} data-testid="project-switcher-no-match">
          {t('office.projects.no_match')}
        </p>
      ) : (
        <p className={styles.line} data-testid="project-switcher-empty">
          {t('office.switcher.no_recent')}
        </p>
      );
  } else {
    content = (
      <div className={styles.list}>
        {list.items.map((item) => {
          const target: LeaveTarget = { kind: 'project', projectId: item.id };
          const saving = busyOn(target);
          return (
            <a
              key={item.id}
              href={projectHref(item.id)}
              className={`${styles.item} ${touch.target}`}
              data-testid="project-switcher-item"
              data-project-id={item.id}
              aria-busy={saving ? 'true' : undefined}
              aria-disabled={busy ? 'true' : undefined}
              onClick={(e) => {
                if (!plainClick(e)) return;
                e.preventDefault();
                void store.pick(item.id);
              }}
            >
              <span className={styles.itemName} data-testid="project-switcher-item-name">
                {item.name}
              </span>
              {saving ? (
                <span className={styles.itemClient} data-testid="project-switcher-item-client">
                  {t('office.editor.saving')}
                </span>
              ) : item.clientName !== null ? (
                <span className={styles.itemClient} data-testid="project-switcher-item-client">
                  {item.clientName}
                </span>
              ) : null}
            </a>
          );
        })}
      </div>
    );
  }

  const backSaving = busyOn({ kind: 'projects' });
  return (
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-label={t('office.switcher.label')}
      className={styles.panel}
      style={maxHeight === undefined ? style : { ...style, maxHeight }}
      data-testid="project-switcher"
      data-mode={state.mode}
      data-list={list.status}
      data-leaving={leaving.status}
    >
      <input
        type="search"
        className={`${styles.search} ${touch.target}`}
        data-testid="project-switcher-search"
        aria-label={t('office.projects.search_label')}
        placeholder={t('office.projects.search_placeholder')}
        maxLength={PROJECT_SEARCH_MAX}
        autoComplete="off"
        value={state.query}
        readOnly={busy}
        onChange={(e) => store.setQuery(e.target.value)}
      />
      {content}
      {leaving.status === 'failed' ? (
        <div data-testid="project-switcher-leave-error">
          <InlineError message="office.lock.stop_failed" onRetry={() => void store.retryLeave()} />
        </div>
      ) : null}
      <a
        href={PROJECTS_HREF}
        className={`${styles.back} ${touch.target}`}
        data-testid="project-switcher-back"
        aria-busy={backSaving ? 'true' : undefined}
        aria-disabled={busy ? 'true' : undefined}
        onClick={(e) => {
          if (!plainClick(e)) return;
          e.preventDefault();
          void store.backToProjects();
        }}
      >
        {backSaving ? t('office.editor.saving') : t('office.switcher.back')}
      </a>
      {onSettings ? (
        <button
          type="button"
          className={`${styles.back} ${styles.settings} ${touch.target}`}
          data-testid="project-switcher-settings"
          disabled={busy}
          onClick={() => onSettings()}
        >
          {t('office.project_settings.menu_item')}
        </button>
      ) : null}
    </div>
  );
}

export type ProjectSwitcherProps = {
  store: SwitcherStore;
  state: SwitcherState;
  anchorRef: RefObject<HTMLButtonElement | null>;
  panelId: string;
  onSettings?: () => void;
};

const GAP = 8;
const MARGIN = 16;

export function ProjectSwitcher({
  store,
  state,
  anchorRef,
  panelId,
  onSettings,
}: ProjectSwitcherProps): ReactElement | null {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const open = state.open;

  // Placed below the name button when it opens (before paint), then the search takes the focus.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || panel === null) return;
    const rect = anchorRef.current?.getBoundingClientRect();
    const top = rect ? rect.bottom + GAP : GAP;
    panel.style.top = `${top}px`;
    panel.style.left = `${rect ? rect.left : MARGIN}px`;
    panel.style.maxHeight = `calc(100vh - ${top}px - ${MARGIN}px)`;
    panel.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const outside = (target: EventTarget | null) =>
      !(target instanceof Node) ||
      !(
        (panelRef.current?.contains(target) ?? false) ||
        (anchorRef.current?.contains(target) ?? false)
      );
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      store.close();
      if (!store.getState().open) anchorRef.current?.focus();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (outside(e.target)) store.close();
    };
    const onFocusIn = (e: FocusEvent) => {
      if (outside(e.target)) store.close();
    };
    const onResize = () => store.close();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('focusin', onFocusIn);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('resize', onResize);
    };
  }, [open, store, anchorRef]);

  if (!open) return null;
  return createPortal(
    <ProjectSwitcherPanel
      state={state}
      store={store}
      panelId={panelId}
      panelRef={panelRef}
      onSettings={
        onSettings
          ? () => {
              store.close();
              onSettings();
            }
          : undefined
      }
    />,
    document.body,
  );
}

// The switcher of one open session, made with the lock UI (use-lock-ui.ts) and loaded with it: the store, the name
// button it last opened from, and where it navigates.
export type SessionSwitcher = {
  store: SwitcherStore;
  // The name button's press (EditorHeader `onProjectMenu`, which passes the click): keeps the button, then toggles.
  toggle: (e?: { currentTarget: EventTarget | null }) => void;
  anchor: RefObject<HTMLButtonElement | null>;
  // The panel gives the router's push once it is mounted.
  setNavigate: (navigate: ((href: string) => void) | null) => void;
  // EZD-130: the open session's Project settings: what the dialog needs, and its save, which puts the new name
  // and client in the session's model, re-reads the defaults and tells `onSaved` listeners (the editor draws its
  // header again, AC-EZD-130-6).
  settings: () => Pick<ProjectSettingsDialogProps, 'projectId' | 'holding' | 'lockEpoch'>;
  saved: (s: ProjectSettings) => void;
  onSaved: (cb: () => void) => () => void;
};

export function sessionSwitcher(
  session: EditorSession,
  capture: () => Promise<ThumbnailCapture | null>,
): SessionSwitcher {
  const anchor: RefObject<HTMLButtonElement | null> = { current: null };
  let navigate: ((href: string) => void) | null = null;
  const savedListeners = new Set<() => void>();
  const store = createSwitcherStore({
    projectId: session.model.project.id,
    api: switcherHttpApi(),
    leave: () => leaveProject(session, capture),
    navigate: (href) => navigate?.(href),
  });
  return {
    store,
    anchor,
    setNavigate(n) {
      navigate = n;
    },
    settings: () => ({
      projectId: session.model.project.id,
      holding: session.lock.holding,
      lockEpoch: session.model.lockEpoch,
    }),
    saved(s) {
      session.model.project.name = s.project.name;
      session.model.project.clientName = s.client?.name ?? null;
      void session.defaults.refresh();
      for (const cb of savedListeners) cb();
    },
    onSaved(cb) {
      savedListeners.add(cb);
      return () => void savedListeners.delete(cb);
    },
    toggle(e) {
      const target = e?.currentTarget;
      if (target instanceof HTMLButtonElement) anchor.current = target;
      store.toggle();
    },
  };
}

// The panel of the session's switcher, with the name button's state set on the button itself (the editor's header
// markup stays as EZD-011b's until the switcher is used, vault/build/assumptions.md EZD-128).
export function SwitcherPart({ switcher }: { switcher: SessionSwitcher }): ReactElement | null {
  const { store, anchor } = switcher;
  const router = useRouter();
  const panelId = useId();
  const { setNavigate } = switcher;
  useEffect(() => {
    setNavigate((href) => router.push(href));
    return () => setNavigate(null);
  }, [setNavigate, router]);
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const open = state.open;
  useEffect(() => {
    const b = anchor.current;
    if (!b) return;
    b.setAttribute('data-testid', 'project-switcher-trigger');
    b.setAttribute('aria-haspopup', 'dialog');
    b.setAttribute('aria-expanded', String(open));
    if (open) b.setAttribute('aria-controls', panelId);
    else b.removeAttribute('aria-controls');
  }, [anchor, open, panelId]);
  return (
    <>
      <ProjectSwitcher
        store={store}
        state={state}
        anchorRef={anchor}
        panelId={panelId}
        onSettings={() => setSettingsOpen(true)}
      />
      {settingsOpen ? (
        <ProjectSettingsDialog
          {...switcher.settings()}
          onClose={() => setSettingsOpen(false)}
          onSaved={(s) => {
            setSettingsOpen(false);
            switcher.saved(s);
          }}
        />
      ) : null}
    </>
  );
}
