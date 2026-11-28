// EZD-1913c (editor plan 5.3 "features plug in"; 2.1 "Version open read-only, diff layer, Revert"): Versions as a
// registry feature, moved unchanged out of ProjectEditor (spec S20).
// - EZD-122 (S20 Entry points, Controls; Q-0700 05, 03 "Revert", 10; AC-EZD-122-2 to -10): the Versions tab in the
//   left panel (lazy, with the version inspector and the status bar text). The header's version text opens it. Each
//   time the tab opens, and after a reopen, the list is read again. A version row opens that version read-only
//   (version-view.ts): every edit path reads `mayEdit`, which is false while a version shows (pausesEdits), so the rail
//   shows the EZD-225 paused state. Revert drains the outbox, posts, then reopens the editor (a new store, so undo is
//   cleared); a version.reverted from someone else reopens it too.
// - EZD-121 text: "Version N" while that sent version is open read-only; EZD-717 (board S13Sheets header "Working copy ·
//   Rev 0 issued"): after Rev 0 the header names the newest issue (the page's sent and issued numbers, given by
//   features/send.tsx and features/sheets.tsx).
// - EZD-123 (Q-0700 05 "Cleanup sheet"; S20 Permissions): a project with due rows opens the cleanup sheet once for a
//   user with Edit model; Save choices shows only to the lock holder, Later closes it.
// - EZD-139 (Q-0220; Q-0700 05; Q-0703): while a version is open, the diff layer outlines what changed since (amber)
//   and what was removed since (red dashed) over the canvas, and the status bar shows its counts and Show changes.
// Places, as ProjectEditor gave them: the header subtitle's middle; the cleanup sheet after the Send dialogs; the
// left panel's tab and Versions tab; the plan's inspector place before every mode's; the diff layer after the
// Assistant preview; the status text at 800.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { lazyModule } from '../../lib/lazy/lazy-module';
import { useT } from '../../lib/messages';
import {
  fetchVersions,
  postRevert,
  postSnapshot,
  type VersionRow,
} from '../../lib/versions/versions';
import type { MessageKey } from '../../server/messages/catalog';
import type { Tab as LeftTab } from '../layers/LeftPanel';
import { STATUS_START_ORDER } from '../shared/feature-slots';
import { lazyPart } from '../shared/lazy-part';
import { useStoreValue } from '../shared/use-store-value';
import { newerVersionNo, versionLabel } from '../version-label';
import { fetchCleanup, postCleanup, type CleanupList } from '../versions/cleanup-summary';
import { hubVersionEvents } from '../versions/version-events';
import type { VersionView, VersionViewState } from '../versions/version-view';
import { versionTitle } from '../versions/versions-list';
import { holdsLock } from './lock';
import styles from './versions.module.css';
import type { EditorFeature, EditorFeatureContext } from './types';

// EZD-122 (11 Budgets): the Versions tab, the version inspector and the status text load when the tab first opens.
// EZD-1910: through the lazy facade, so the entry contents check (EZD-120c B11) covers them.
const versionsModule = lazyModule(() => import('../../lazy/versions'));

const LazyVersions = lazyPart(versionsModule, 'VersionsPanel');
const LazyVersionInspector = lazyPart(versionsModule, 'VersionInspector');
const LazyVersionsStatus = lazyPart(versionsModule, 'VersionsStatus');
const LazyCleanupSheet = lazyPart(versionsModule, 'CleanupSheet');
const LazyDiffLayer = lazyPart(versionsModule, 'DiffLayer');

const CLEANUP_AGE_DEFAULT = 30;

const noop = () => {};

const NOT_VIEWING: VersionViewState = {
  viewing: null,
  opening: null,
  failed: false,
  objects: null,
  diff: null,
  showChanges: true,
};

export function versionErrorKey(code: string): MessageKey {
  switch (code) {
    case 'stale_lock_epoch':
      return 'error.stale_lock_epoch';
    case 'permission_denied':
      return 'error.not_authorized';
    case 'version_not_found':
      return 'error.version_not_found';
    case 'version_not_working':
      return 'error.version_not_working';
    case 'invalid_input':
    case 'invalid_object':
      return 'error.invalid_input';
    default:
      return 'office.versions.action_failed';
  }
}

type CleanupChoices = { keep: { id: string; name: string }[]; remove: string[] };

export type VersionsOwn = {
  readonly versionView: VersionView | null;
  readonly view: VersionViewState;
  readonly tab: LeftTab;
  readonly setTab: (tab: LeftTab) => void;
  readonly rows: VersionRow[] | null;
  readonly failed: boolean;
  readonly reverting: boolean;
  /** The last refusal's text, for the version it was about. */
  readonly error: { readonly id: string; readonly text: string } | null;
  readonly revert: () => Promise<void>;
  readonly nameSnapshot: (name: string) => Promise<string | null>;
  /** The header's version text, which opens the Versions tab (the same element until its text changes). */
  readonly link: ReactElement;
  readonly cleanup: CleanupList | null;
  readonly cleanupOpen: boolean;
  readonly cleanupSaving: boolean;
  readonly cleanupError: string | null;
  readonly saveCleanup: (choices: CleanupChoices) => Promise<void>;
  readonly closeCleanup: () => void;
};

const ownOf = (ctx: EditorFeatureContext): VersionsOwn | undefined =>
  ctx.own?.get('versions') as VersionsOwn | undefined;

function useVersionsOwn(ctx: EditorFeatureContext): VersionsOwn {
  const t = useT();
  const { projectId, page } = ctx;
  const session = ctx.ready?.session ?? null;
  const sync = session?.sync ?? null;
  const versionView = ctx.ready?.controllers.versions ?? null;
  const view = useStoreValue(versionView, (v) => v.getState(), NOT_VIEWING);
  const viewing = view.viewing;
  const [tab, setTab] = useState<LeftTab>('layers');
  const [rows, setRows] = useState<VersionRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reverting, setReverting] = useState(false);
  // The last refusal, for the version it was about.
  const [versionError, setVersionError] = useState<{ id: string; key: MessageKey } | null>(null);
  const refresh = useCallback(() => {
    void fetchVersions(projectId).then((r) => {
      if (r.ok) setRows(r.body);
      setFailed(!r.ok);
    });
  }, [projectId]);
  // Each time the tab opens, and after a reopen, the list is read again.
  useEffect(() => {
    if (tab === 'versions' && session !== null) refresh();
  }, [tab, session, refresh]);
  const reopen = ctx.reopen ?? noop;
  const reopenRef = useRef(reopen);
  useEffect(() => {
    reopenRef.current = reopen;
  });
  // The id of the version this editor's own revert made: its broadcast is not a reason to reopen again.
  const ownRevert = useRef<string | null>(null);
  useEffect(
    () =>
      hubVersionEvents(projectId, {
        onReverted: (p) => {
          if (p.modelVersionId !== ownRevert.current) reopenRef.current();
        },
        onNamed: () => refresh(),
      }),
    [projectId, refresh],
  );

  // EZD-123: the cleanup sheet.
  const canEditModel = ctx.ready?.canEditModel ?? false;
  const [cleanup, setCleanup] = useState<CleanupList | null>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupSaving, setCleanupSaving] = useState(false);
  const [cleanupError, setCleanupError] = useState<MessageKey | null>(null);
  const cleanupRead = useRef<string | null>(null);
  useEffect(() => {
    // The model load says whether any row is due, so a project with none asks for nothing more (EZD-120c B1).
    if (session === null || !canEditModel || session.model.project.cleanupDue !== true) return;
    if (cleanupRead.current === projectId) return;
    cleanupRead.current = projectId;
    void fetchCleanup(projectId).then((r) => {
      if (!r.ok || r.list.rows.length === 0) return;
      setCleanup(r.list);
      setCleanupOpen(true);
    });
  }, [session, canEditModel, projectId]);
  const saveCleanup = async (choices: CleanupChoices) => {
    if (session === null || cleanupSaving) return;
    setCleanupSaving(true);
    setCleanupError(null);
    const r = await postCleanup(projectId, { lockEpoch: session.model.lockEpoch, ...choices });
    setCleanupSaving(false);
    if (!r.ok) {
      setCleanupError(versionErrorKey(r.code));
      return;
    }
    setCleanupOpen(false);
    refresh();
  };

  // EZD-122 (Q-0700 03 "Revert"): the outbox drains, the route reverts, then the editor reopens with a new store.
  const labelOf = (row: VersionRow): string => {
    const title = versionTitle(row);
    return 'text' in title ? title.text : t(title.key, title.params);
  };
  const revert = async () => {
    if (session === null || viewing === null || reverting) return;
    setReverting(true);
    setVersionError(null);
    try {
      await sync?.flush();
    } catch {
      /* the save-failed banner says it; the route refuses a stale generation */
    }
    // The row as the list has it now (a name given since it was opened included).
    const current = rows?.find((row) => row.id === viewing.id) ?? viewing;
    const r = await postRevert(projectId, viewing.id, {
      lockEpoch: session.model.lockEpoch,
      label: labelOf(current),
    });
    setReverting(false);
    if (!r.ok) {
      setVersionError({ id: viewing.id, key: versionErrorKey(r.code) });
      return;
    }
    ownRevert.current = r.body.id;
    reopen();
  };
  const nameSnapshot = async (name: string): Promise<string | null> => {
    if (viewing === null) return 'no_version';
    const r = await postSnapshot(projectId, viewing.id, name);
    if (!r.ok) {
      setVersionError({ id: viewing.id, key: versionErrorKey(r.code) });
      return r.code;
    }
    setVersionError(null);
    refresh();
    return null;
  };

  // The header's version text.
  const sentNo = useStoreValue(page?.sentNo, (s) => s.get(), null);
  const issuedNo = useStoreValue(page?.issuedNo, (s) => s.get(), null);
  const versionNo = newerVersionNo(session?.model.project.versionNo ?? null, sentNo);
  const revNo = newerVersionNo(session?.model.project.revNo ?? null, issuedNo);
  const label = versionLabel({
    lastSent:
      revNo !== null
        ? { kind: 'rev', no: revNo }
        : versionNo === null
          ? null
          : { kind: 'version', no: versionNo },
    viewing:
      viewing !== null && viewing.isSent && viewing.versionNo !== null
        ? { kind: 'version', no: viewing.versionNo }
        : null,
  });
  const versionText = t(label.key, label.params);
  // EZD-122 (S20 Entry points; Q-0700 05): the version text opens the Versions tab.
  const link = useMemo(
    () => (
      <button
        key="version"
        type="button"
        className={styles.versionLink}
        data-testid="editor-version"
        onClick={() => setTab('versions')}
      >
        {versionText}
      </button>
    ),
    [versionText],
  );

  return {
    versionView,
    view,
    tab,
    setTab,
    rows,
    failed,
    reverting,
    error: versionError === null ? null : { id: versionError.id, text: t(versionError.key) },
    revert,
    nameSnapshot,
    link,
    cleanup,
    cleanupOpen,
    cleanupSaving,
    cleanupError: cleanupError === null ? null : t(cleanupError),
    saveCleanup,
    closeCleanup: () => setCleanupOpen(false),
  };
}

export const feature: EditorFeature = {
  id: 'versions',
  order: STATUS_START_ORDER.versions,
  active: (ctx) => ctx.ready !== undefined,
  useOwn: useVersionsOwn,
  pausesEdits: (ctx) => (ownOf(ctx)?.view.viewing ?? null) !== null,
  headerSubtitle: (ctx) => ownOf(ctx)?.link ?? null,
  header: (ctx) => {
    const own = ownOf(ctx);
    if (ctx.ready === undefined || own === undefined || !own.cleanupOpen || own.cleanup === null)
      return null;
    return (
      <LazyCleanupSheet
        rows={own.cleanup.rows}
        graceDays={own.cleanup.graceDays}
        ageDays={own.cleanup.ageDays}
        canSave={holdsLock(ctx)}
        saving={own.cleanupSaving}
        error={own.cleanupError}
        onSave={(choices) => void own.saveCleanup(choices)}
        onLater={own.closeCleanup}
      />
    );
  },
  leftPanelProps: (ctx) => {
    const own = ownOf(ctx);
    const session = ctx.ready?.session;
    if (own === undefined || session === undefined) return {};
    const { versionView, view } = own;
    const cleanupAge = session.defaults.get()['version_cleanup_age'];
    return {
      tab: own.tab,
      onTab: own.setTab,
      versions:
        versionView !== null ? (
          <LazyVersions
            rows={own.rows}
            failed={own.failed}
            openFailed={view.failed}
            viewingId={view.viewing?.id ?? null}
            openingId={view.opening}
            cleanupAgeDays={typeof cleanupAge === 'number' ? cleanupAge : CLEANUP_AGE_DEFAULT}
            onOpen={(row) => void versionView.open(row)}
            onBack={versionView.back}
          />
        ) : undefined,
    };
  },
  inspectorOver: (ctx) => {
    const own = ownOf(ctx);
    const ready = ctx.ready;
    const viewing = own?.view.viewing ?? null;
    if (own === undefined || ready === undefined || viewing === null) return null;
    return (
      <LazyVersionInspector
        row={own.rows?.find((r) => r.id === viewing.id) ?? viewing}
        rows={own.rows ?? []}
        canEditModel={ready.canEditModel}
        canRevert={holdsLock(ctx)}
        onName={own.nameSnapshot}
        onRevert={() => void own.revert()}
        reverting={own.reverting}
        error={own.error?.id === viewing.id ? own.error.text : null}
      />
    );
  },
  planLayer: (ctx) => {
    const own = ownOf(ctx);
    const controllers = ctx.ready?.controllers;
    if (own === undefined || controllers === undefined) return null;
    return own.versionView !== null && own.view.viewing !== null ? (
      <LazyDiffLayer
        view={own.versionView}
        handle={controllers.plan.handle}
        floors={controllers.floors}
      />
    ) : null;
  },
  statusStart: (ctx) => {
    const own = ownOf(ctx);
    if (own === undefined || (own.tab !== 'versions' && own.view.viewing === null)) return null;
    return (
      <LazyVersionsStatus
        rows={own.rows}
        viewing={own.view.viewing}
        onBack={own.versionView?.back ?? noop}
        diff={own.view.diff}
        showChanges={own.view.showChanges}
        onShowChanges={own.versionView?.setShowChanges ?? noop}
      />
    );
  },
};
