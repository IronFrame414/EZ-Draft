'use client';
// EZD-117a Step 13 (vault/plans/EZD-117a.md Decided "View wiring", "Board markup", "Tabs", "Sort menu",
// "Scroll loading", "No-access view"; section 3; S01 Layout, Controls; Q-0402; Q-0403): the Projects page body.
// The status tabs with counts, the sort menu (EZD-108 `Menu`), the 4-column cards and a sentinel that loads the
// next 48 as it scrolls into view.
// EZD-117b Build step 12 (vault/plans/EZD-117b.md Decided "View wiring", "No-access view", "Board states",
// "NewProjectButton"; section 3; S01 States; Q-0214; Q-0414): the header with the search, New project (Create
// projects only; disabled offline), the offline banner, the error banners with Retry, six skeleton cards while
// loading, and the empty and no-match blocks.
// EZD-118 Build step 16 (vault/plans/EZD-118.md Decided "Entry", "After create"; Q-0394; Q-0410): both New project
// buttons open the New project dialog; after a create the list goes back to All, Last edited and no search.
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  PROJECT_SORTS,
  PROJECT_TABS,
  type ProjectSort,
  type ProjectTab,
} from '../../lib/projects/projects';
import {
  createProjectListStore,
  projectHttpApi,
  type ProjectListState,
} from '../../lib/projects/projects-store';
import { useT } from '../../lib/messages';
import { useOnline } from '../../lib/network';
import touch from '../../styles/touch.module.css';
import { Icon } from '../icon/Icon';
import { Menu, MenuItem } from '../menu/Menu';
import { InlineError } from '../states/InlineError';
import { NoAccess } from '../states/NoAccess';
import { OfflineBanner } from '../states/OfflineBanner';
import { Skeleton, SkeletonGroup } from '../states/Skeleton';
import { StateButton } from '../states/StateButton';
import { NewProjectDialog } from './NewProjectDialog';
import { ProjectCard } from './ProjectCard';
import { ProjectsHeader, type ProjectsAccount } from './ProjectsHeader';
import styles from './Projects.module.css';

export type ProjectsBoardProps = {
  state: ProjectListState;
  actions?: ReactNode;
  onTab(tab: ProjectTab): void;
  onSort(sort: ProjectSort): void;
  onMore(): void;
  canCreate?: boolean;
  onNewProject?: () => void;
  onRetry?: () => void;
  onClearFilters?: () => void;
};

// New project: disabled offline (Q-0414); until EZD-118 passes onNewProject the click does nothing.
function NewProjectButton({ testId, onNewProject }: { testId: string; onNewProject?: () => void }) {
  const t = useT();
  const online = useOnline();
  return (
    <StateButton
      variant="primary"
      className={styles.newButton}
      data-testid={testId}
      disabled={!online}
      onClick={onNewProject}
    >
      <Icon name="add" size={18} />
      {t('office.projects.new')}
    </StateButton>
  );
}

// Distance below the viewport at which the next page loads (the observer's bottom root margin).
const MORE_MARGIN_PX = 400;

// One IntersectionObserver per mounted sentinel; while the sentinel stays in view, each change of the item
// count or the more status asks again (a page that does not fill the view loads the next one). The "in view"
// ref is measured again before that ask: the observer reports a move only after the next frame, so its last
// value is stale right after 48 new cards push the sentinel down.
function MoreSentinel({
  moreStatus,
  itemCount,
  onMore,
}: {
  moreStatus: ProjectListState['moreStatus'];
  itemCount: number;
  onMore(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useRef(false);
  const onMoreRef = useRef(onMore);
  useEffect(() => {
    onMoreRef.current = onMore;
  }, [onMore]);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          inView.current = entry.isIntersecting;
          if (entry.isIntersecting) onMoreRef.current();
        }
      },
      { rootMargin: `0px 0px ${MORE_MARGIN_PX}px 0px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el === null || moreStatus !== 'idle') return;
    const rect = el.getBoundingClientRect();
    inView.current = rect.top <= window.innerHeight + MORE_MARGIN_PX && rect.bottom >= 0;
    if (inView.current) onMoreRef.current();
  }, [itemCount, moreStatus]);

  return (
    <div
      ref={ref}
      className={styles.more}
      aria-hidden="true"
      data-testid="projects-more"
      data-more-state={moreStatus}
    />
  );
}

export function ProjectsBoard({
  state,
  actions,
  onTab,
  onSort,
  onMore,
  canCreate = false,
  onNewProject,
  onRetry,
  onClearFilters,
}: ProjectsBoardProps) {
  const t = useT();
  const sortLabel = t(`office.projects.sort.${state.sort}`);
  const ready = state.status === 'ready';
  const nothing = ready && state.items.length === 0;
  return (
    <main className={styles.main}>
      <OfflineBanner />
      <div className={styles.titleRow}>
        <h1 className={styles.h1} data-testid="projects-title">
          {t('office.projects.title')}
        </h1>
        <div className={styles.tabs} role="group" aria-label={t('office.projects.status_label')}>
          {PROJECT_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={styles.tab}
              data-testid={`projects-tab-${tab}`}
              aria-pressed={state.tab === tab}
              onClick={() => onTab(tab)}
            >
              {t(`office.projects.status.${tab}`)}
              {state.counts !== null ? (
                <span className={styles.count} data-testid="projects-tab-count">
                  {state.counts[tab]}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <span className={styles.spacer} />
        <Menu
          label={t('office.projects.sort_label', { sort: sortLabel })}
          trigger={
            <>
              <Icon name="sort" size={18} />
              <span>{sortLabel}</span>
            </>
          }
          triggerClassName={`${styles.sortButton} ${touch.target}`}
          triggerTestId="projects-sort"
          contentClassName={styles.menu}
          contentTestId="projects-sort-menu"
        >
          {PROJECT_SORTS.map((sort) => (
            <MenuItem
              key={sort}
              testId={`projects-sort-${sort}`}
              className={`${styles.menuItem} ${touch.target}${sort === state.sort ? ` ${styles.menuItemOn}` : ''}`}
              onSelect={() => onSort(sort)}
            >
              {t(`office.projects.sort.${sort}`)}
            </MenuItem>
          ))}
        </Menu>
        {canCreate ? <NewProjectButton testId="projects-new" onNewProject={onNewProject} /> : null}
        {actions}
      </div>
      {state.status === 'error' || state.countsStatus === 'error' ? (
        <div className={styles.loadError} data-testid="projects-error">
          <InlineError message="office.projects.load_error" onRetry={onRetry} />
        </div>
      ) : null}
      <div
        className={styles.grid}
        data-testid="projects-grid"
        data-state={state.status}
        aria-busy={state.status === 'loading'}
      >
        {state.status === 'loading' ? (
          <SkeletonGroup count={6} className={styles.skeletons}>
            <div className={styles.skeletonCard} data-testid="projects-skeleton">
              <Skeleton height="168px" radius="sm" />
              <div className={styles.skeletonBody}>
                <Skeleton width="55%" height="15px" />
                <Skeleton width="75%" height="13px" />
                <Skeleton width="35%" height="12px" />
              </div>
            </div>
          </SkeletonGroup>
        ) : null}
        {ready ? state.items.map((p) => <ProjectCard key={p.id} project={p} />) : null}
      </div>
      {nothing && state.search === '' && state.tab === 'all' ? (
        <div className={styles.empty} data-testid="projects-empty">
          {t('office.projects.empty')}
          {canCreate ? (
            <NewProjectButton testId="projects-empty-new" onNewProject={onNewProject} />
          ) : null}
        </div>
      ) : null}
      {nothing && (state.search !== '' || state.tab !== 'all') ? (
        <div className={styles.empty} data-testid="projects-no-match">
          {t('office.projects.no_match')}
          <button
            type="button"
            className={styles.linkButton}
            data-testid="projects-clear-filter"
            onClick={onClearFilters}
          >
            {t('office.projects.clear_filter')}
          </button>
        </div>
      ) : null}
      {ready && state.next !== null ? (
        <MoreSentinel
          moreStatus={state.moreStatus}
          itemCount={state.items.length}
          onMore={onMore}
        />
      ) : null}
      {state.moreStatus === 'error' ? (
        <div className={styles.loadError} data-testid="projects-more-error">
          <InlineError message="office.projects.load_error" onRetry={onRetry} />
        </div>
      ) : null}
    </main>
  );
}

export function ProjectsView({
  account,
  canCreate,
}: {
  account: ProjectsAccount;
  canCreate: boolean;
}): ReactElement {
  const [store] = useState(() => createProjectListStore(projectHttpApi));
  useEffect(() => {
    store.start();
    return () => store.dispose();
  }, [store]);
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  const [text, setText] = useState('');
  const [creating, setCreating] = useState(false);
  return (
    <>
      <ProjectsHeader
        account={account}
        search={{
          query: text,
          onQuery: (v) => {
            setText(v);
            store.setQuery(v);
          },
          onClear: () => {
            setText('');
            store.clearSearch();
          },
        }}
      />
      <ProjectsBoard
        state={state}
        onTab={store.setTab}
        onSort={store.setSort}
        onMore={store.loadMore}
        canCreate={canCreate}
        onNewProject={() => setCreating(true)}
        onRetry={() => store.retry()}
        onClearFilters={() => {
          setText('');
          store.clearFilters();
        }}
      />
      {creating ? (
        <NewProjectDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setText('');
            store.reset();
          }}
        />
      ) : null}
    </>
  );
}

export function ProjectsNoAccessView({ account }: { account: ProjectsAccount }): ReactElement {
  const t = useT();
  return (
    <>
      <ProjectsHeader account={account} search={null} />
      <main className={styles.main}>
        <div className={styles.titleRow}>
          <h1 className={styles.h1} data-testid="projects-title">
            {t('office.projects.title')}
          </h1>
          <span className={styles.spacer} />
        </div>
        <NoAccess />
      </main>
    </>
  );
}
