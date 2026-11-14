'use client';

// EZD-135b Build step 5 (vault/plans/EZD-135b.md Decided "Data per card", "Fetch", "Paging state", "Skeleton and
// error"; S15i System status, states and iPad boards; AC-EZD-135-2, AC-EZD-135-3): the four System status cards,
// each loading on its own so one failed card never blanks another, and the header's Updated line and Refresh
// button, which reload all four.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useT } from '../../../lib/messages';
import { formatNotificationTime } from '../../../lib/notifications/time';
import {
  SYSTEM_STATUS_PAGE_SIZE,
  type BackupStatus,
  type JobFailureRow,
  type StatusPage,
  type WebhookFailureRow,
} from '../../../lib/system-status/system-status';
import { Icon } from '../../icon/Icon';
import { AsyncView } from '../../states/AsyncView';
import { Skeleton, SkeletonGroup } from '../../states/Skeleton';
import { StateButton } from '../../states/StateButton';
import { BackupsBody, DrillBody, JobFailuresBody, WebhookFailuresBody } from './StatusCards';
import styles from './SystemStatus.module.css';

type Refresh = { tick: number; updatedAt: number; refresh: () => void };

const RefreshContext = createContext<Refresh>({ tick: 0, updatedAt: 0, refresh: () => {} });

export function SystemStatusProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());
  const refresh = useCallback(() => {
    setTick((n) => n + 1);
    setUpdatedAt(Date.now());
  }, []);
  return (
    <RefreshContext.Provider value={{ tick, updatedAt, refresh }}>
      {children}
    </RefreshContext.Provider>
  );
}

// The Updated line and Refresh button in the page head (S15i W3, W4).
export function SystemStatusRefresh() {
  const t = useT();
  const { updatedAt, refresh } = useContext(RefreshContext);
  const [now, setNow] = useState(updatedAt);
  // A clock older than updatedAt (right after Refresh) reads as "Just now" until the next tick.
  useEffect(() => {
    // eslint-disable-next-line no-restricted-globals -- display-only clock for the Updated line, no data polled
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const when = formatNotificationTime(new Date(updatedAt).toISOString(), new Date(now));
  return (
    <div className={styles.refresh}>
      <span data-testid="system-status-updated" className={styles.updated}>
        <span>{t('office.system_status.updated')}</span>
        <span>{t(when.key, when.params)}</span>
      </span>
      <StateButton data-testid="system-status-refresh" compact onClick={refresh}>
        <Icon name="refresh" size={17} />
        {t('office.system_status.refresh')}
      </StateButton>
    </div>
  );
}

async function get<T>(params: Record<string, string>, signal: AbortSignal): Promise<T> {
  const res = await fetch(`/api/settings/system-status?${new URLSearchParams(params)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
    signal,
  });
  if (res.status !== 200) throw new Error('system_status_load_failed');
  return (await res.json()) as T;
}

const skeleton = (
  <SkeletonGroup count={3} className={styles.skeleton}>
    <Skeleton height="36px" />
  </SkeletonGroup>
);

function Card({
  id,
  className,
  title,
  scope,
  children,
}: {
  id: string;
  className: string;
  title: string;
  scope?: string;
  children: ReactNode;
}) {
  return (
    <section data-testid={`system-status-${id}`} className={`${styles.card} ${className}`}>
      <div className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        {scope === undefined ? null : <span className={styles.scope}>{scope}</span>}
      </div>
      <div data-testid={`system-status-${id}-body`} className={styles.body}>
        {children}
      </div>
    </section>
  );
}

export function SystemStatusPanel() {
  const t = useT();
  const { tick } = useContext(RefreshContext);
  const [jobsPage, setJobsPage] = useState(1);
  const [webhooksPage, setWebhooksPage] = useState(1);

  const loadJobs = useCallback(
    async (signal: AbortSignal) => {
      const data = await get<StatusPage<JobFailureRow>>(
        { part: 'jobs', page: String(jobsPage) },
        signal,
      );
      // Past the end (rows went away): go to the last page, which loads once more.
      if (data.rows.length === 0 && data.total > 0 && jobsPage > 1) {
        setJobsPage(Math.ceil(data.total / SYSTEM_STATUS_PAGE_SIZE));
      }
      return data;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick reloads the card on Refresh
    [jobsPage, tick],
  );
  const loadWebhooks = useCallback(
    async (signal: AbortSignal) => {
      const data = await get<StatusPage<WebhookFailureRow>>(
        { part: 'webhooks', page: String(webhooksPage) },
        signal,
      );
      if (data.rows.length === 0 && data.total > 0 && webhooksPage > 1) {
        setWebhooksPage(Math.ceil(data.total / SYSTEM_STATUS_PAGE_SIZE));
      }
      return data;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick reloads the card on Refresh
    [webhooksPage, tick],
  );
  // Two fetches of part=backups, so a failed load shows on one card only.
  const loadBackups = useCallback(
    (signal: AbortSignal) => get<BackupStatus>({ part: 'backups' }, signal),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick reloads the card on Refresh
    [tick],
  );
  const loadDrill = useCallback(
    (signal: AbortSignal) => get<BackupStatus>({ part: 'backups' }, signal),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick reloads the card on Refresh
    [tick],
  );

  return (
    <div data-testid="system-status-panel" className={styles.cards}>
      <Card id="backups" className={styles.backups} title={t('office.system_status.backup_title')}>
        <AsyncView
          load={loadBackups}
          skeleton={skeleton}
          errorMessage="office.system_status.load_failed"
        >
          {(d) => <BackupsBody data={d} />}
        </AsyncView>
      </Card>
      <Card id="drill" className={styles.drill} title={t('office.system_status.drill_title')}>
        <AsyncView
          load={loadDrill}
          skeleton={skeleton}
          errorMessage="office.system_status.load_failed"
        >
          {(d) => <DrillBody data={d} />}
        </AsyncView>
      </Card>
      <Card
        id="webhooks"
        className={styles.webhooks}
        title={t('office.system_status.webhooks_title')}
      >
        <AsyncView
          load={loadWebhooks}
          skeleton={skeleton}
          errorMessage="office.system_status.load_failed"
        >
          {(d) => <WebhookFailuresBody data={d} onPage={setWebhooksPage} />}
        </AsyncView>
      </Card>
      <Card
        id="jobs"
        className={styles.jobs}
        title={t('office.system_status.jobs_title')}
        scope={t('office.system_status.jobs_scope')}
      >
        <AsyncView
          load={loadJobs}
          skeleton={skeleton}
          errorMessage="office.system_status.load_failed"
        >
          {(d) => <JobFailuresBody data={d} onPage={setJobsPage} />}
        </AsyncView>
      </Card>
    </div>
  );
}
