// EZD-1201 (Q-0213 "Link on or off, who it was sent to, expiry date"; S18 States "Contractor renews for 30 days";
// 11 Security "renewable, revocable"; Q-0700 Copy link only in the send response): the Share panel rows and the
// browser client. Expected texts are the en catalog's office.share keys; dates are en-US "Mon D, YYYY" in UTC.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import {
  fetchShareLinks,
  renewShareLinkRequest,
  revokeShareLinkRequest,
  type ShareLink,
} from '../../lib/share-links/share-links';
import { catalogFor } from '../../server/messages/catalog';
import { ShareLinkList } from './ShareLinks';

const render = (el: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {el}
    </MessagesProvider>,
  );

const strip = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim();

const row = (over: Partial<ShareLink>): ShareLink => ({
  id: '00000000-0000-4000-8000-000000000001',
  versionNo: 3,
  recipient: { name: 'Zed Co', email: 'zedco@example.test' },
  emailSentAt: null,
  createdAt: '2026-10-11T12:00:00Z',
  expiresAt: '2026-11-10T12:00:00Z',
  renewedAt: null,
  revokedAt: null,
  status: 'active',
  ...over,
});

const noop = () => {};
const list = (links: ShareLink[], extra: { failed?: boolean; online?: boolean; busyId?: string | null } = {}) =>
  render(
    <ShareLinkList
      links={links}
      busyId={extra.busyId ?? null}
      failed={extra.failed ?? false}
      online={extra.online ?? true}
      onRenew={noop}
      onRevoke={noop}
      timeZone="UTC"
    />,
  );

const rows = (html: string) => html.split('data-testid="share-link"').slice(1);

describe('EZD-1201 Share panel links', () => {
  it('S1 no links and no failure renders nothing', () => {
    expect(list([])).not.toContain('share-links');
  });

  it('S2 each row shows Version N, the client and on, expired or off with the expiry date', () => {
    const html = list([
      row({ id: 'a', status: 'active', versionNo: 3 }),
      row({ id: 'b', status: 'expired', versionNo: 2, expiresAt: '2026-10-01T12:00:00Z' }),
      row({ id: 'c', status: 'revoked', versionNo: 1, revokedAt: '2026-09-01T12:00:00Z' }),
    ]);
    const r = rows(html);
    expect(r).toHaveLength(3);
    expect(strip('<x ' + r[0])).toContain('Version 3 · Zed Co On · expires Nov 10, 2026 Renew Turn off');
    expect(strip('<x ' + r[1])).toContain('Version 2 · Zed Co Expired Oct 1, 2026 Renew Turn off');
    expect(strip('<x ' + r[2])).toContain('Version 1 · Zed Co Off');
    expect(r[2]).not.toContain('share-link-renew');
    expect(r[2]).not.toContain('share-link-revoke');
    expect(html).toContain('Links sent');
    // No Copy link on an earlier link: only the token's hash is kept (Q-0700).
    expect(html).not.toContain('Copy link');
  });

  it('S3 Renew and Turn off are disabled offline and while a change runs', () => {
    for (const html of [list([row({})], { online: false }), list([row({})], { busyId: 'x' })]) {
      expect(html).toMatch(/data-testid="share-link-renew"[^>]*disabled/);
      expect(html).toMatch(/data-testid="share-link-revoke"[^>]*disabled/);
    }
    expect(list([row({})])).not.toMatch(/data-testid="share-link-renew"[^>]*disabled/);
  });

  it('S4 a failure shows the error line', () => {
    expect(strip(list([], { failed: true }))).toContain("Couldn't update the links. Try again.");
  });
});

describe('EZD-1201 share links browser client', () => {
  const json = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('C1 list, renew and revoke call their routes', async () => {
    const links = [row({})];
    const f = json(200, { links });
    expect(await fetchShareLinks('p 1', { fetchImpl: f })).toEqual({ ok: true, links });
    expect((f as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]).toBe('/api/share-links?projectId=p%201');

    const w = json(200, { link: {} });
    expect(await renewShareLinkRequest('id1', { fetchImpl: w })).toEqual({ ok: true });
    expect(await revokeShareLinkRequest('id1', { fetchImpl: w })).toEqual({ ok: true });
    const calls = (w as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
    expect(calls.map((c) => [c[0], c[1].method])).toEqual([
      ['/api/share-links/id1/renew', 'POST'],
      ['/api/share-links/id1/revoke', 'POST'],
    ]);
  });

  it('C2 a refusal keeps its code; a thrown fetch is network', async () => {
    const refused = json(409, { error: { code: 'share_link_revoked', message_key: 'error.share_link_revoked' } });
    expect(await renewShareLinkRequest('id1', { fetchImpl: refused })).toEqual({
      ok: false,
      status: 409,
      code: 'share_link_revoked',
    });
    const thrown = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await fetchShareLinks('p', { fetchImpl: thrown })).toEqual({ ok: false, status: 0, code: 'network' });
  });
});
