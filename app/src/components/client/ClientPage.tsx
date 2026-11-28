'use client';
// EZD-1202 (S18 Layout, States; board S18Client; AC-EZD-1202-1; vault/build/assumptions/EZD-1202.md Settled rows
// "Version label", "Header and tabs", "Parts of the Design tab built later", "Expiring banner day count", "Offline"):
// the client page shell. Header: company name in capitals, project name, "Design approval", the sent version label,
// the menu (Help: Contact {Company}). Tabs: Design, and Plans when the send shares a sheet set (EZD-2032). Banners: link
// expiring, offline "Connect to approve". The Design tab's cards are later tickets and stay hidden until they ship.
// States: expired, not found, unavailable, failed load with Try again, Loading… while it reloads. Dates and the day
// count use the viewer's device clock and time zone, so they render after hydration.
import { useCallback, useState, useSyncExternalStore } from 'react';
import { Icon } from '../icon/Icon';
import { Disclaimer } from '../disclaimer/Disclaimer';
import { InlineError } from '../states/InlineError';
import { OfflineBannerView } from '../states/OfflineBanner';
import { useT } from '../../lib/messages';
import { useOnline } from '../../lib/network';
import { ClientPlans } from './ClientPlans';
import { expiringBanner, versionLabel, type ClientPageResult, type ClientPageView } from './client-page-model';
import styles from './ClientPage.module.css';

const noSubscribe = () => () => {};

// The notice and banner keys (passed as props, so kept here as keys, never typed words).
const KEYS = {
  expired: 'error.share_link_expired',
  unavailable: 'error.share_link_unavailable',
  notFound: 'client.not_found',
  offline: 'client.offline',
} as const;

/** False on the server and during hydration, true after: the device clock and time zone are read only then. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'done'; result: ClientPageResult };

async function fetchClientPage(token: string): Promise<ClientPageResult | null> {
  let res: Response;
  let body: unknown;
  try {
    res = await fetch(`/api/c/${encodeURIComponent(token)}`, { cache: 'no-store', credentials: 'omit' });
    body = await res.json();
  } catch {
    return null;
  }
  const b = body as { page?: ClientPageView; company?: string; error?: { code?: string } } | null;
  if (res.status === 200 && b?.page) return { status: 'active', page: b.page };
  if (res.status === 410 && typeof b?.company === 'string') return { status: 'expired', company: b.company };
  if (res.status === 404 && b?.error?.code === 'share_link_unavailable') return { status: 'unavailable' };
  if (res.status === 404) return { status: 'not_found' };
  return null;
}

export function ClientPage({ token, initial }: { token: string; initial: ClientPageResult | null }) {
  const [load, setLoad] = useState<Load>(
    initial === null ? { kind: 'failed' } : { kind: 'done', result: initial },
  );
  const retry = useCallback(() => {
    setLoad({ kind: 'loading' });
    void fetchClientPage(token).then((r) => setLoad(r === null ? { kind: 'failed' } : { kind: 'done', result: r }));
  }, [token]);

  if (load.kind === 'done' && load.result.status === 'active') return <ActivePage token={token} page={load.result.page} />;
  return (
    <div className={styles.frame} data-client-state={stateName(load)}>
      <main className={styles.main}>
        <div className={styles.notice}>
          <Notice load={load} onRetry={retry} />
        </div>
      </main>
      <footer className={styles.footer}>
        <Disclaimer placement="page" />
      </footer>
    </div>
  );
}

function stateName(load: Load): string {
  return load.kind === 'done' ? load.result.status : load.kind;
}

function Notice({ load, onRetry }: { load: Load; onRetry: () => void }) {
  const t = useT();
  if (load.kind === 'loading') {
    return (
      <p role="status" className={styles.message}>
        {t('client.loading')}
      </p>
    );
  }
  if (load.kind === 'failed') {
    return (
      <div role="alert" className={styles.failed}>
        <p className={styles.message}>{t('client.load_failed')}</p>
        <button type="button" className={styles.button} onClick={onRetry}>
          {t('client.try_again')}
        </button>
      </div>
    );
  }
  const r = load.result;
  if (r.status === 'expired') {
    return <InlineError message={KEYS.expired} params={{ company: r.company }} />;
  }
  if (r.status === 'unavailable') return <InlineError message={KEYS.unavailable} />;
  return <InlineError message={KEYS.notFound} />;
}

function ActivePage({ token, page }: { token: string; page: ClientPageView }) {
  const t = useT();
  const [tab, setTab] = useState<'design' | 'plans'>('design');
  const hydrated = useHydrated();
  const online = useOnline();
  const label = hydrated ? versionLabel(page.version) : null;
  const expiring = hydrated ? expiringBanner(page.expiresAt, page.reminderLeadDays, new Date()) : null;
  return (
    <div className={styles.frame} data-client-state="active">
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <div className={styles.titleBlock}>
            <p className={styles.company} data-testid="client-company">
              {page.company}
            </p>
            <h1 className={styles.project}>{page.project.name}</h1>
          </div>
          <div className={styles.versionBlock}>
            <p className={styles.approval}>{t('client.design_approval')}</p>
            <p className={styles.version} data-testid="client-version">
              {label ? t(label.key, label.params) : null}
            </p>
          </div>
          <ClientMenu page={page} />
        </div>
        <div role="tablist" aria-label={t('client.tabs')} className={styles.tabs}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'design'}
            aria-controls="client-tabpanel"
            id="client-tab-design"
            className={styles.tab}
            onClick={() => setTab('design')}
          >
            {t('client.tab.design')}
          </button>
          {page.sharesSheets ? (
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'plans'}
              aria-controls="client-tabpanel"
              id="client-tab-plans"
              className={styles.tab}
              onClick={() => setTab('plans')}
            >
              {t('client.tab.plans')}
            </button>
          ) : null}
        </div>
      </header>
      <main className={styles.main} role="tabpanel" id="client-tabpanel" aria-labelledby={`client-tab-${tab}`}>
        {expiring || !online ? (
          <div className={styles.banners}>
            {expiring ? (
              <p role="status" className={styles.expiring} data-testid="client-expiring">
                {t(expiring.key, expiring.params)}
              </p>
            ) : null}
            {!online ? <OfflineBannerView message={KEYS.offline} /> : null}
          </div>
        ) : null}
        {tab === 'plans' && page.sharesSheets ? <ClientPlans token={token} /> : null}
      </main>
      <footer className={styles.footer}>
        <Disclaimer placement="page" />
      </footer>
    </div>
  );
}

function ClientMenu({ page }: { page: ClientPageView }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const contact = t('client.contact', { company: page.company });
  return (
    <div className={styles.menuWrap}>
      <button
        type="button"
        className={styles.menuButton}
        aria-label={t('client.menu')}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="more_horiz" size={20} />
      </button>
      {open ? (
        <div className={styles.menu} role="group" aria-label={t('client.help')}>
          <p className={styles.menuHeading}>{t('client.help')}</p>
          <p className={styles.menuLine}>{contact}</p>
          {page.contact.phone !== '' ? (
            <a className={styles.menuLink} href={`tel:${page.contact.phone.replace(/[^0-9+]/g, '')}`}>
              {page.contact.phone}
            </a>
          ) : null}
          {page.contact.email !== '' ? (
            <a className={styles.menuLink} href={`mailto:${page.contact.email}`}>
              {page.contact.email}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
