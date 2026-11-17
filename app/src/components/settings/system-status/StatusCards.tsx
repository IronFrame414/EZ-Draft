// EZD-135b Build step 4 (vault/plans/EZD-135b.md Decided "Table bodies", "Pager", "Backups card", "Drill card";
// S15i System status and states boards; AC-EZD-135-2, AC-EZD-135-3): the body of each System status card, from
// the route's reply. Imported only by the client panel; keys go to t() as literals.
import { useT } from '../../../lib/messages';
import {
  SYSTEM_STATUS_PAGE_SIZE,
  formatBytes,
  formatStatusTime,
  type BackupRow,
  type BackupStatus,
  type JobFailureRow,
  type StatusPage,
  type WebhookFailureRow,
} from '../../../lib/system-status/system-status';
import { Icon } from '../../icon/Icon';
import { StateButton } from '../../states/StateButton';
import styles from './SystemStatus.module.css';

type Part = 'jobs' | 'webhooks';

function Pager({
  part,
  data,
  onPage,
}: {
  part: Part;
  data: StatusPage<unknown>;
  onPage: (page: number) => void;
}) {
  const t = useT();
  if (data.total <= SYSTEM_STATUS_PAGE_SIZE) return null;
  const from = (data.page - 1) * SYSTEM_STATUS_PAGE_SIZE + 1;
  const to = Math.min(data.page * SYSTEM_STATUS_PAGE_SIZE, data.total);
  return (
    <div data-testid={`system-status-${part}-pager`} className={styles.pager}>
      <span data-testid={`system-status-${part}-range`} className={styles.range}>
        {t('office.system_status.range', { from, to, total: data.total })}
      </span>
      <StateButton
        data-testid={`system-status-${part}-prev`}
        compact
        aria-label={t('office.system_status.prev')}
        title={t('office.system_status.prev')}
        disabled={data.page <= 1}
        onClick={() => onPage(data.page - 1)}
      >
        <Icon name="chevron_left" size={18} />
      </StateButton>
      <StateButton
        data-testid={`system-status-${part}-next`}
        compact
        aria-label={t('office.system_status.next')}
        title={t('office.system_status.next')}
        disabled={to >= data.total}
        onClick={() => onPage(data.page + 1)}
      >
        <Icon name="chevron_right" size={18} />
      </StateButton>
    </div>
  );
}

function Empty({
  testId,
  icon,
  ok,
  children,
}: {
  testId: string;
  icon: 'check_circle' | 'cloud_off' | 'history';
  ok?: boolean;
  children: string;
}) {
  return (
    <div data-testid={testId} className={ok ? `${styles.empty} ${styles.emptyOk}` : styles.empty}>
      <Icon name={icon} size={18} />
      <span>{children}</span>
    </div>
  );
}

export function JobFailuresBody({
  data,
  onPage,
  timeZone,
}: {
  data: StatusPage<JobFailureRow>;
  onPage: (page: number) => void;
  timeZone?: string;
}) {
  const t = useT();
  if (data.total === 0) {
    return (
      <Empty testId="system-status-jobs-empty" icon="check_circle" ok>
        {t('office.system_status.jobs_empty')}
      </Empty>
    );
  }
  return (
    <>
      <table data-testid="system-status-jobs-table" className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>{t('office.system_status.col_failed')}</th>
            <th className={styles.th}>{t('office.system_status.col_kind')}</th>
            <th className={styles.th}>{t('office.system_status.col_error')}</th>
            <th className={styles.th}>{t('office.system_status.col_tries')}</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.id} data-testid="system-status-job-row" className={styles.tr}>
              <td className={styles.td}>
                <span className={styles.mono}>{formatStatusTime(row.finishedAt, timeZone)}</span>
              </td>
              <td className={styles.td}>{row.kind}</td>
              <td className={styles.td}>
                <span className={styles.mono}>{row.error ?? t('office.system_status.none')}</span>
              </td>
              <td className={styles.td}>{String(row.attempts)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager part="jobs" data={data} onPage={onPage} />
    </>
  );
}

// error_alert.title of a delivery is `<event>: <status>` (report.ts reportWebhookFailure): the event goes under
// Sent to and the status under Error; a title without the separator shows whole under Sent to.
function splitDelivery(title: string): { sentTo: string; error: string | null } {
  const at = title.lastIndexOf(': ');
  if (at < 0) return { sentTo: title, error: null };
  return { sentTo: title.slice(0, at), error: title.slice(at + 2) };
}

export function WebhookFailuresBody({
  data,
  onPage,
  timeZone,
}: {
  data: StatusPage<WebhookFailureRow>;
  onPage: (page: number) => void;
  timeZone?: string;
}) {
  const t = useT();
  if (data.total === 0) {
    return (
      <Empty testId="system-status-webhooks-empty" icon="check_circle" ok>
        {t('office.system_status.webhooks_empty')}
      </Empty>
    );
  }
  return (
    <>
      <table data-testid="system-status-webhooks-table" className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>{t('office.system_status.col_failed')}</th>
            <th className={styles.th}>{t('office.system_status.col_sent_to')}</th>
            <th className={styles.th}>{t('office.system_status.col_error')}</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => {
            const d = splitDelivery(row.title);
            return (
              <tr key={row.id} data-testid="system-status-webhook-row" className={styles.tr}>
                <td className={styles.td}>
                  <span className={styles.mono}>{formatStatusTime(row.lastSeenAt, timeZone)}</span>
                </td>
                <td className={styles.td}>{d.sentTo}</td>
                <td className={styles.td}>
                  <span className={styles.mono}>{d.error ?? t('office.system_status.none')}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Pager part="webhooks" data={data} onPage={onPage} />
    </>
  );
}

function BackupBlock({
  testId,
  name,
  schedule,
  row,
  timeZone,
}: {
  testId: string;
  name: string;
  schedule: string;
  row: BackupRow | null;
  timeZone?: string;
}) {
  const t = useT();
  const none = t('office.system_status.none');
  return (
    <div data-testid={testId} className={styles.block}>
      <div className={styles.blockHead}>
        <span className={styles.blockName}>{name}</span>
        <span className={styles.schedule}>{schedule}</span>
      </div>
      <div className={styles.kv}>
        <span className={styles.key}>{t('office.system_status.backup_finished')}</span>
        <span data-testid={`${testId}-finished`} className={styles.value}>
          {row ? formatStatusTime(row.finishedAt, timeZone) : none}
        </span>
      </div>
      <div className={styles.kv}>
        <span className={styles.key}>{t('office.system_status.backup_size')}</span>
        <span data-testid={`${testId}-size`} className={styles.value}>
          {row ? formatBytes(row.bytesCopied) : none}
        </span>
      </div>
      <div className={styles.kv}>
        <span className={styles.key}>{t('office.system_status.backup_copied_to')}</span>
        <span data-testid={`${testId}-location`} className={styles.value}>
          {row?.location ?? none}
        </span>
      </div>
    </div>
  );
}

export function BackupsBody({ data, timeZone }: { data: BackupStatus; timeZone?: string }) {
  const t = useT();
  if (data.files === null && data.dbDump === null) {
    return (
      <Empty testId="system-status-backups-empty" icon="cloud_off">
        {t('office.system_status.backup_empty')}
      </Empty>
    );
  }
  return (
    <div className={styles.blocks}>
      <BackupBlock
        testId="system-status-backup-files"
        name={t('office.system_status.backup_files')}
        schedule={t('office.system_status.backup_files_schedule')}
        row={data.files}
        timeZone={timeZone}
      />
      <BackupBlock
        testId="system-status-backup-db-dump"
        name={t('office.system_status.backup_db_dump')}
        schedule={t('office.system_status.backup_db_dump_schedule')}
        row={data.dbDump}
        timeZone={timeZone}
      />
    </div>
  );
}

export function DrillBody({ data, timeZone }: { data: BackupStatus; timeZone?: string }) {
  const t = useT();
  const drill = data.restoreDrill;
  if (drill === null) {
    return (
      <Empty testId="system-status-drill-empty" icon="history">
        {t('office.system_status.drill_empty')}
      </Empty>
    );
  }
  const failed = drill.status === 'failed';
  return (
    <div data-testid="system-status-drill-line" className={styles.drillLine}>
      <span className={styles.key}>{t('office.system_status.drill_ran')}</span>
      <span data-testid="system-status-drill-time" className={styles.drillTime}>
        {formatStatusTime(drill.finishedAt, timeZone)}
      </span>
      <span
        data-testid={failed ? 'system-status-drill-failed' : 'system-status-drill-passed'}
        className={`${styles.pill} ${failed ? styles.failed : styles.passed}`}
      >
        <Icon name={failed ? 'error' : 'check_circle'} size={15} />
        {t(failed ? 'office.system_status.drill_failed' : 'office.system_status.drill_passed')}
      </span>
    </div>
  );
}
