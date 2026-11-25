'use client';
// EZD-1201 (Q-0213 "Link on or off, who it was sent to, expiry date, Copy link, Resend"; Q-0781 built from the
// written spec in the Send dialog's style; S18 States "Contractor renews for 30 days"): the Share panel's links,
// shown in the Send dialog under the send. One row per earlier send, newest first: Version N, the client, On /
// Expired / Off and the expiry date, with Renew (on or expired) and Turn off (on or expired). Copy link exists
// only right after a send (Q-0700: only the token's hash is kept); Resend is the dialog's Send, a new send.
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { StateButton } from '../../components/states/StateButton';
import { useT } from '../../lib/messages';
import {
  fetchShareLinks,
  renewShareLinkRequest,
  revokeShareLinkRequest,
  type ShareLink,
} from '../../lib/share-links/share-links';
import styles from './SendDialog.module.css';

export function shareLinkDate(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(iso),
  );
}

export type ShareLinkListProps = {
  links: ShareLink[];
  busyId: string | null;
  failed: boolean;
  online: boolean;
  onRenew: (id: string) => void;
  onRevoke: (id: string) => void;
  timeZone?: string;
};

// The rows alone, for the render test.
export function ShareLinkList({
  links,
  busyId,
  failed,
  online,
  onRenew,
  onRevoke,
  timeZone,
}: ShareLinkListProps): ReactElement | null {
  const t = useT();
  if (links.length === 0 && !failed) return null;
  return (
    <section data-testid="share-links" className={styles.links} aria-label={t('office.share.links')}>
      <h3 className={styles.linksTitle}>{t('office.share.links')}</h3>
      {failed ? (
        <p data-testid="share-links-error" role="alert" className={styles.error}>
          {t('office.share.failed')}
        </p>
      ) : null}
      <ul className={styles.linkList}>
        {links.map((l) => {
          const date = shareLinkDate(l.expiresAt, timeZone);
          const state =
            l.status === 'active'
              ? t('office.share.on', { date })
              : l.status === 'expired'
                ? t('office.share.expired', { date })
                : t('office.share.off');
          const busy = busyId !== null;
          return (
            <li key={l.id} data-testid="share-link" data-status={l.status} data-link-id={l.id} className={styles.linkRow}>
              <span className={styles.linkText}>
                <span className={styles.linkVersion}>
                  {l.versionNo === null ? l.recipient.name : t('office.share.row', { n: l.versionNo, name: l.recipient.name })}
                </span>
                <span data-testid="share-link-state" className={styles.linkState}>
                  {state}
                </span>
              </span>
              {l.status === 'revoked' ? null : (
                <span className={styles.linkActions}>
                  <StateButton
                    data-testid="share-link-renew"
                    disabled={busy || !online}
                    onClick={() => onRenew(l.id)}
                  >
                    {t('office.share.renew')}
                  </StateButton>
                  <StateButton
                    data-testid="share-link-revoke"
                    disabled={busy || !online}
                    onClick={() => onRevoke(l.id)}
                  >
                    {t('office.share.turn_off')}
                  </StateButton>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export type ShareLinksProps = {
  projectId: string;
  online: boolean;
  // Changes after each send, so the new link shows.
  refreshKey: number;
  fetchImpl?: typeof fetch;
};

export function ShareLinks({ projectId, online, refreshKey, fetchImpl }: ShareLinksProps): ReactElement | null {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const opts = fetchImpl ? { fetchImpl } : undefined;

  const load = useCallback(async () => {
    const r = await fetchShareLinks(projectId, fetchImpl ? { fetchImpl } : undefined);
    if (r.ok) {
      setLinks(r.links);
      setFailed(false);
    } else setFailed(true);
  }, [projectId, fetchImpl]);

  useEffect(() => {
    let live = true;
    void fetchShareLinks(projectId, fetchImpl ? { fetchImpl } : undefined).then((r) => {
      if (!live) return;
      if (r.ok) {
        setLinks(r.links);
        setFailed(false);
      } else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [projectId, fetchImpl, refreshKey]);

  const act = async (id: string, request: typeof renewShareLinkRequest) => {
    if (busyId !== null) return;
    setBusyId(id);
    try {
      const r = await request(id, opts);
      if (!r.ok) setFailed(true);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ShareLinkList
      links={links}
      busyId={busyId}
      failed={failed}
      online={online}
      onRenew={(id) => void act(id, renewShareLinkRequest)}
      onRevoke={(id) => void act(id, revokeShareLinkRequest)}
    />
  );
}
