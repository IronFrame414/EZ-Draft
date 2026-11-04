'use client';

// EZD-113 Step 16 (vault/plans/EZD-113.md Decided "Panel", "Panel layout", "Body states", "Table",
// "Archived toggle", "Pager", "Offline", "Writes from the page"; S15a Customers; B15a): the Customers list on
// Settings > Company, 50 per page, searchable, with each customer's project count. The AsyncView renders the
// body only, so the search input keeps focus while a new page loads.
import { useCallback, useState } from 'react';
import {
  CUSTOMER_PAGE_SIZE,
  type CustomerCounts,
  type CustomerPage,
  type CustomerRow,
} from '../../../lib/customers/customers';
import { useT } from '../../../lib/messages';
import { useOnline } from '../../../lib/network';
import { initialsFor } from '../../../lib/users/initials';
import { Icon } from '../../icon/Icon';
import { AsyncView } from '../../states/AsyncView';
import { Skeleton, SkeletonGroup } from '../../states/Skeleton';
import { StateButton } from '../../states/StateButton';
import { CustomerDialog } from './CustomerDialog';
import styles from './Customers.module.css';

export type CustomersPanelProps = { onCounts?: (counts: CustomerCounts) => void };

export function CustomersPanel({ onCounts }: CustomersPanelProps) {
  const t = useT();
  const online = useOnline();
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);
  const [counts, setCounts] = useState<CustomerCounts | null>(null);
  const [editing, setEditing] = useState<CustomerRow | null | undefined>(undefined);

  const load = useCallback(
    async (signal: AbortSignal): Promise<CustomerPage> => {
      const params = new URLSearchParams({
        q: q.trim(),
        archived: archived ? '1' : '0',
        page: String(page),
      });
      const res = await fetch(`/api/settings/customers?${params}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      });
      if (res.status !== 200) throw new Error('customers_load_failed');
      const data = (await res.json()) as CustomerPage;
      const next = { active: data.active, archived: data.archived };
      setCounts(next);
      onCounts?.(next);
      // Past the end after an archive: go to the last page, which loads once more.
      if (data.rows.length === 0 && data.total > 0 && page > 1) {
        setPage(Math.ceil(data.total / CUSTOMER_PAGE_SIZE));
      }
      return data;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick reloads the page after a save (Decided "Panel")
    [q, archived, page, tick, onCounts],
  );

  const term = q.trim();
  const openAdd = () => setEditing(null);

  const body = (data: CustomerPage) => {
    if (data.total === 0) {
      if (term !== '') {
        return (
          <div data-testid="customers-no-match" className={styles.empty}>
            {t('office.customers.no_match', { query: term })}
          </div>
        );
      }
      if (archived) {
        return (
          <div data-testid="customers-archived-empty" className={styles.empty}>
            {t('office.customers.archived_empty')}
          </div>
        );
      }
      return (
        <div data-testid="customers-empty" className={styles.empty}>
          {t('office.customers.empty')}
          <StateButton
            data-testid="customers-empty-add"
            variant="primary"
            disabled={!online}
            onClick={openAdd}
          >
            {t('office.customers.add')}
          </StateButton>
        </div>
      );
    }
    const from = (data.page - 1) * CUSTOMER_PAGE_SIZE + 1;
    const to = Math.min(data.page * CUSTOMER_PAGE_SIZE, data.total);
    return (
      <>
        <table data-testid="customers-table" className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>{t('office.customers.col_customer')}</th>
              <th className={styles.th}>{t('office.customers.col_email')}</th>
              <th className={styles.th}>{t('office.customers.col_phone')}</th>
              <th className={styles.th}>{t('office.customers.col_projects')}</th>
              <th className={styles.th} />
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr
                key={row.id}
                data-testid="customer-row"
                data-customer-id={row.id}
                className={styles.tr}
              >
                <td className={styles.td}>
                  <span className={styles.customer}>
                    <span className={styles.av} aria-hidden="true">
                      {initialsFor(row.name, row.email)}
                    </span>
                    <span data-testid="customer-name" className={styles.name}>
                      {row.name}
                    </span>
                  </span>
                </td>
                <td className={styles.td}>
                  <span className={styles.emailCell}>
                    <span data-testid="customer-email">{row.email}</span>
                    <span className={styles.signing}>
                      <Icon name="verified_user" size={13} />
                      {t('office.customers.signing_on')}
                    </span>
                  </span>
                </td>
                <td data-testid="customer-phone" className={`${styles.td} ${styles.phone}`}>
                  {row.phone ?? ''}
                </td>
                <td
                  data-testid="customer-projects"
                  className={row.projectCount === 0 ? `${styles.td} ${styles.none}` : styles.td}
                >
                  {row.projectCount === 0
                    ? t('office.customers.projects_none')
                    : t('office.customers.projects_count', { count: row.projectCount })}
                </td>
                <td className={styles.td}>
                  <StateButton
                    data-testid="customer-edit"
                    variant="icon"
                    compact
                    aria-label={t('office.customers.row_edit', { name: row.name })}
                    disabled={!online}
                    onClick={() => setEditing(row)}
                  >
                    <Icon name="more_horiz" size={18} />
                  </StateButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.total > CUSTOMER_PAGE_SIZE ? (
          <div className={styles.pager}>
            <span data-testid="customers-range">
              {t('office.customers.range', { from, to, total: data.total })}
            </span>
            <StateButton
              data-testid="customers-prev"
              compact
              disabled={data.page <= 1}
              onClick={() => setPage(data.page - 1)}
            >
              {t('office.customers.prev')}
            </StateButton>
            <StateButton
              data-testid="customers-next"
              compact
              disabled={to >= data.total}
              onClick={() => setPage(data.page + 1)}
            >
              {t('office.customers.next')}
            </StateButton>
          </div>
        ) : null}
      </>
    );
  };

  return (
    <section data-testid="customers-panel" className={styles.panel}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <Icon name="person_book" size={17} />
          {t('office.customers.title')}
          {counts !== null ? (
            <span className={styles.count}>
              <span data-testid="customers-count">{counts.active}</span>
              {' · '}
              <button
                type="button"
                data-testid="customers-archived-toggle"
                className={styles.toggle}
                aria-pressed={archived}
                disabled={!archived && counts.archived === 0}
                onClick={() => {
                  setArchived((a) => !a);
                  setPage(1);
                }}
              >
                {t('office.customers.archived_toggle', { count: counts.archived })}
              </button>
            </span>
          ) : null}
        </h2>
        <label className={styles.search}>
          <Icon name="search" size={17} />
          <input
            data-testid="customers-search"
            className={styles.searchInput}
            aria-label={t('office.customers.search')}
            placeholder={t('office.customers.search')}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <StateButton data-testid="customers-add" compact disabled={!online} onClick={openAdd}>
          <Icon name="add" size={17} />
          {t('office.customers.add')}
        </StateButton>
      </div>
      <div data-testid="customers-body">
        <AsyncView
          load={load}
          skeleton={
            <SkeletonGroup count={5}>
              <Skeleton height="36px" />
            </SkeletonGroup>
          }
          errorMessage="office.customers.load_failed"
        >
          {body}
        </AsyncView>
      </div>
      <div data-testid="customers-note" className={styles.note}>
        <Icon name="verified_user" size={16} />
        <span>{t('office.customers.note')}</span>
      </div>
      {editing !== undefined ? (
        <CustomerDialog
          customer={editing}
          onClose={() => setEditing(undefined)}
          onDone={() => {
            setEditing(undefined);
            setTick((n) => n + 1);
          }}
        />
      ) : null}
    </section>
  );
}
