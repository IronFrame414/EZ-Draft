'use client';
// EZD-117a Step 13 (vault/plans/EZD-117a.md Decided "View wiring", "Board markup", "Tabs", "Sort menu",
// "Scroll loading", "No-access view"; section 3; S01 Layout, Controls; Q-0402; Q-0403): the Projects page body.
// The status tabs with counts, the sort menu (EZD-108 `Menu`), the 4-column cards and a sentinel that loads the
// next 48 as it scrolls into view. Loading, error and empty states are EZD-117b's: the grid stays empty.
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
import touch from '../../styles/touch.module.css';
import { Icon } from '../icon/Icon';
import { Menu, MenuItem } from '../menu/Menu';
import { NoAccess } from '../states';
import { ProjectCard } from './ProjectCard';
import styles from './Projects.module.css';

export type ProjectsBoardProps = {
  state: ProjectListState;
  actions?: ReactNode;
  onTab(tab: ProjectTab): void;
  onSort(sort: ProjectSort): void;
  onMore(): void;
};

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

export function ProjectsBoard({ state, actions, onTab, onSort, onMore }: ProjectsBoardProps) {
  const t = useT();
  const sortLabel = t(`office.projects.sort.${state.sort}`);
  const ready = state.status === 'ready';
  return (
    <main className={styles.main}>
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
        {actions}
      </div>
      <div
        className={styles.grid}
        data-testid="projects-grid"
        data-state={state.status}
        aria-busy={state.status === 'loading'}
      >
        {ready ? state.items.map((p) => <ProjectCard key={p.id} project={p} />) : null}
      </div>
      {ready && state.next !== null ? (
        <MoreSentinel
          moreStatus={state.moreStatus}
          itemCount={state.items.length}
          onMore={onMore}
        />
      ) : null}
    </main>
  );
}

export function ProjectsView({ actions }: { actions?: ReactNode }): ReactElement {
  const [store] = useState(() => createProjectListStore(projectHttpApi));
  useEffect(() => {
    store.start();
    return () => store.dispose();
  }, [store]);
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  return (
    <ProjectsBoard
      state={state}
      actions={actions}
      onTab={store.setTab}
      onSort={store.setSort}
      onMore={store.loadMore}
    />
  );
}

export function ProjectsNoAccessView({ actions }: { actions?: ReactNode }): ReactElement {
  const t = useT();
  return (
    <main className={styles.main}>
      <div className={styles.titleRow}>
        <h1 className={styles.h1} data-testid="projects-title">
          {t('office.projects.title')}
        </h1>
        <span className={styles.spacer} />
        {actions}
      </div>
      <NoAccess />
    </main>
  );
}
