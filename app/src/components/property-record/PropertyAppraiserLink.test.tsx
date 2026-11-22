// EZD-711 (S01 Property appraiser link "user confirms each field ... On read failure, offer 'Paste page text' or
// 'Paste screenshot' ... Year built before 1978 sets the lead flag"; board S01bWizard "3 of 5 confirmed", "Read from
// the page. Tick each field to confirm.", "Paste page text or screenshot", "1986 · no lead flag (pre-1978 only)", "2,140
// SF"; 11 rule 11 "Push, not poll"; AC-EZD-711-2). Static markup for the box (the app's Vitest runs in node, no DOM)
// and the read client with a fake user channel and fetch. The read and click flow is in
// e2e/property-appraiser-import.spec.ts.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { MessagesProvider } from '../../lib/messages';
import type { PropertyFields } from '../../lib/property-record/property-record';
import { catalogFor } from '../../server/messages/catalog';
import { startRead, watchRead } from './appraiser-read-client';
import { PropertyAppraiserLink } from './PropertyAppraiserLink';

const wrap = (node: React.ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {node}
    </MessagesProvider>,
  );

const one = (html: string, id: string) => {
  const found = elements(html, id);
  expect(found, id).toHaveLength(1);
  return found[0]!;
};

const FIELDS: PropertyFields = {
  parcelNo: '00-43-44-21-01-000-0010',
  owner: 'HENDRICKS FAMILY TRUST',
  legalDescription: 'GOLFVIEW HEIGHTS LT 10 BLK 2',
  yearBuilt: 1975,
  livingArea: 2140,
};

describe('EZD-711 PropertyAppraiserLink markup', () => {
  it('before a read: the title, the link box, Read and the paste offer; no fields', () => {
    const html = wrap(<PropertyAppraiserLink projectId={null} onChange={() => {}} />);
    expect(html).toContain('Property appraiser link');
    expect(attr(one(html, 'property-record-url').attrs, 'placeholder')).toBe('Paste the parcel page link');
    const read = one(html, 'property-record-read');
    expect(textOf(read.inner)).toBe('Read');
    expect(attr(read.attrs, 'disabled')).not.toBeNull();
    expect(textOf(one(html, 'property-record-paste-open').inner)).toBe('Paste page text or screenshot');
    expect(elements(html, 'property-record-count')).toEqual([]);
    expect(elements(html, 'property-record-tick-owner')).toEqual([]);
  });

  it('AC-EZD-711-2 a saved year built 1975 shows the lead flag; every saved field is ticked', () => {
    const html = wrap(
      <PropertyAppraiserLink
        projectId="p1"
        initial={{ sourceUrl: 'https://pbcpao.gov/Property/Details?parcelId=1', fields: FIELDS }}
        onChange={() => {}}
      />,
    );
    expect(textOf(one(html, 'property-record-count').inner)).toBe('5 of 5 confirmed');
    expect(html).toContain('Read from the page. Tick each field to confirm.');
    for (const f of ['parcelNo', 'owner', 'legalDescription', 'yearBuilt', 'livingArea']) {
      expect(attr(one(html, `property-record-tick-${f}`).attrs, 'checked'), f).not.toBeNull();
    }
    expect(textOf(one(html, 'property-record-lead').inner)).toBe('· lead flag (pre-1978)');
    expect(textOf(one(html, 'property-record-value-livingArea').inner)).toBe('2,140 SF');
    expect(textOf(one(html, 'property-record-value-parcelNo').inner)).toBe('00-43-44-21-01-000-0010');
  });

  it('the board year 1986 shows "no lead flag (pre-1978 only)"; a blank field cannot be ticked', () => {
    const html = wrap(
      <PropertyAppraiserLink
        projectId="p1"
        initial={{ sourceUrl: null, fields: { ...FIELDS, yearBuilt: 1986, legalDescription: null } }}
        onChange={() => {}}
      />,
    );
    expect(textOf(one(html, 'property-record-lead').inner)).toBe('· no lead flag (pre-1978 only)');
    expect(textOf(one(html, 'property-record-count').inner)).toBe('4 of 5 confirmed');
    const legal = one(html, 'property-record-tick-legalDescription');
    expect(attr(legal.attrs, 'checked')).toBeNull();
    expect(attr(legal.attrs, 'disabled')).not.toBeNull();
    expect(textOf(one(html, 'property-record-value-legalDescription').inner)).toBe('Not on the page');
  });
});

type Listener = (p: { jobId: string; status: string }) => void;

function fakeChannel() {
  const listeners: Listener[] = [];
  const resyncs: (() => void)[] = [];
  let ready: () => void = () => {};
  return {
    channel: {
      on: (_e: string, cb: Listener) => {
        listeners.push(cb);
        return () => listeners.splice(listeners.indexOf(cb), 1);
      },
      onResync: (cb: () => void) => {
        resyncs.push(cb);
        return () => resyncs.splice(resyncs.indexOf(cb), 1);
      },
      ready: new Promise<'subscribed'>((r) => (ready = () => r('subscribed'))),
    },
    push: (p: { jobId: string; status: string }) => listeners.slice().forEach((l) => l(p)),
    subscribed: () => ready(),
    listeners,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('EZD-711 appraiser read client', () => {
  it('a link starts a read; an unreadable answer comes back with no job', async () => {
    const fetchFn = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ projectId: null, url: 'https://example.com' });
      return Response.json({ output: { status: 'unreadable' } }, { status: 200 });
    });
    expect(await startRead(null, { kind: 'link', url: 'https://example.com' }, fetchFn as typeof fetch)).toEqual({
      status: 'unreadable',
    });
    const started = vi.fn(async () => Response.json({ jobId: 'j1' }, { status: 202 }));
    expect(await startRead('p1', { kind: 'text', text: 'page' }, started as typeof fetch)).toEqual({ jobId: 'j1' });
    const denied = vi.fn(async () => Response.json({}, { status: 403 }));
    expect(await startRead(null, { kind: 'text', text: 'page' }, denied as typeof fetch)).toEqual({
      status: 'failed',
      denied: true,
    });
  });

  it('the answer comes on the push that the job finished, fetched once (no timers)', async () => {
    const fake = fakeChannel();
    const job = { status: 'running', result: null as unknown };
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe('/api/jobs/j1');
      return Response.json({ job });
    });
    const onAnswer = vi.fn();
    watchRead(fake.channel as never, 'j1', onAnswer, fetchFn as typeof fetch);
    fake.subscribed();
    await flush();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();

    fake.push({ jobId: 'other', status: 'done' });
    fake.push({ jobId: 'j1', status: 'running' });
    await flush();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    job.status = 'done';
    job.result = { purpose: 'property_appraiser.read', output: { status: 'read', fields: FIELDS } };
    fake.push({ jobId: 'j1', status: 'done' });
    await flush();
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({ status: 'read', fields: FIELDS });
    fake.push({ jobId: 'j1', status: 'done' });
    await flush();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('a read that finished before the subscription is answered when the channel is ready; a failed job fails', async () => {
    const fake = fakeChannel();
    const fetchFn = vi.fn(async () => Response.json({ job: { status: 'failed', result: null } }));
    const onAnswer = vi.fn();
    const off = watchRead(fake.channel as never, 'j2', onAnswer, fetchFn as typeof fetch);
    fake.subscribed();
    await flush();
    expect(onAnswer).toHaveBeenCalledWith({ status: 'failed' });
    off();
    expect(fake.listeners).toHaveLength(0);
  });
});
