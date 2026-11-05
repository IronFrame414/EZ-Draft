'use client';

// EZD-118 Build step 14 (vault/plans/EZD-118.md Decided "Picker", "Picker data", "Picker states", "Touch targets";
// board S01b customer field; S01 Controls "Client"; Q-0400): pick the project's customer from the company's
// active customers. A Radix Popover with a search, one page of 50 at a time and the S01 states. Opening loads
// page 1; a search change loads again after SEARCH_DEBOUNCE_MS; a newer request aborts the older; reopening
// loads again.
import { Popover } from 'radix-ui';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import type { Customer, CustomerPage } from '../../lib/customers/customers';
import { useT } from '../../lib/messages';
import { SEARCH_DEBOUNCE_MS } from '../../lib/projects/projects';
import { initialsFor } from '../../lib/users/initials';
import touch from '../../styles/touch.module.css';
import { Icon } from '../icon/Icon';
import { InlineError, Skeleton } from '../states';
import styles from './NewProject.module.css';

export type CustomerPickerProps = {
  value: Customer | null;
  onChange: (c: Customer | null) => void;
};

function CustomerLabel({ customer }: { customer: Customer }) {
  const t = useT();
  return (
    <>
      <span className={styles.avatar}>{initialsFor(customer.name, customer.email)}</span>
      <span className={styles.who}>
        <span>{customer.name}</span>
        <span className={styles.line} data-testid="new-project-customer-line">
          {customer.phone !== null
            ? t('office.new_project.customer_line', {
                email: customer.email,
                phone: customer.phone,
              })
            : customer.email}
        </span>
      </span>
    </>
  );
}

type Loaded = {
  status: 'loading' | 'ready' | 'error';
  rows: Customer[];
  total: number;
  page: number;
};

function PickerMenu({
  value,
  onPick,
}: {
  value: Customer | null;
  onPick: (c: Customer | null) => void;
}) {
  const t = useT();
  const [q, setQ] = useState('');
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading', rows: [], total: 0, page: 1 });
  const ctl = useRef<AbortController | null>(null);
  const lastQ = useRef('');

  const load = useCallback(async (query: string, page: number) => {
    ctl.current?.abort();
    const mine = new AbortController();
    ctl.current = mine;
    lastQ.current = query;
    setLoaded((s) => ({ ...s, status: 'loading', page, rows: page === 1 ? [] : s.rows }));
    try {
      const res = await fetch(
        '/api/settings/customers?' +
          new URLSearchParams({ q: query.trim(), archived: '0', page: String(page) }),
        { cache: 'no-store', credentials: 'same-origin', signal: mine.signal },
      );
      if (res.status !== 200) throw new Error('customers_load_failed');
      const data = (await res.json()) as CustomerPage;
      if (ctl.current !== mine) return;
      setLoaded((s) => ({
        status: 'ready',
        rows: page === 1 ? data.rows : [...s.rows, ...data.rows],
        total: data.total,
        page,
      }));
    } catch {
      if (ctl.current !== mine || mine.signal.aborted) return;
      setLoaded((s) => ({ ...s, status: 'error' }));
    }
  }, []);

  // Open: page 1 at once. A search change: page 1 after the debounce.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      void load(q, 1);
      return;
    }
    const timer = setTimeout(() => void load(q, 1), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, load]);

  useEffect(() => () => ctl.current?.abort(), []);

  const { status, rows, total, page } = loaded;
  return (
    <>
      <input
        data-testid="new-project-customer-search"
        className={`${styles.input} ${styles.search} ${touch.target}`}
        type="search"
        placeholder={t('office.customers.search')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {value !== null ? (
        <button
          type="button"
          data-testid="new-project-customer-none"
          className={`${styles.option} ${touch.target}`}
          onClick={() => onPick(null)}
        >
          {t('office.new_project.customer_none')}
        </button>
      ) : null}
      {rows.map((c) => (
        <button
          key={c.id}
          type="button"
          data-testid="new-project-customer-option"
          data-customer-id={c.id}
          className={styles.option}
          onClick={() => onPick(c)}
        >
          <CustomerLabel customer={c} />
        </button>
      ))}
      {status === 'loading' ? (
        <div className={styles.states} data-testid="new-project-customer-loading">
          <Skeleton height="26px" />
          <Skeleton height="26px" />
          <Skeleton height="26px" />
        </div>
      ) : null}
      {status === 'error' ? (
        <div className={styles.states} data-testid="new-project-customer-load-error">
          <InlineError
            message="office.customers.load_failed"
            onRetry={() => void load(lastQ.current, page)}
          />
        </div>
      ) : null}
      {status === 'ready' && total === 0 && q.trim() === '' ? (
        <p className={styles.note} data-testid="new-project-customer-empty">
          {t('office.customers.empty')}
        </p>
      ) : null}
      {status === 'ready' && total === 0 && q.trim() !== '' ? (
        <p className={styles.note} data-testid="new-project-customer-no-match">
          {t('office.customers.no_match', { query: q.trim() })}
        </p>
      ) : null}
      {status === 'ready' && rows.length < total ? (
        <button
          type="button"
          data-testid="new-project-customer-more"
          className={`${styles.option} ${touch.target}`}
          onClick={() => void load(q, page + 1)}
        >
          {t('office.new_project.customer_more')}
        </button>
      ) : null}
    </>
  );
}

export function CustomerPicker({ value, onChange }: CustomerPickerProps): ReactElement {
  const t = useT();
  const [open, setOpen] = useState(false);
  const pick = (c: Customer | null) => {
    setOpen(false);
    onChange(c);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          data-testid="new-project-customer"
          className={`${styles.input} ${styles.trigger} ${touch.target}`}
        >
          <span className={styles.triggerText}>
            {value !== null ? (
              <CustomerLabel customer={value} />
            ) : (
              t('office.new_project.customer_placeholder')
            )}
          </span>
          <span className={styles.chevron}>
            <Icon name="expand_more" size={18} />
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content data-testid="new-project-customer-menu" className={styles.menu}>
          <PickerMenu value={value} onPick={pick} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
