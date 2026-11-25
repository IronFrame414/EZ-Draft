// EZD-711 (phase-07 EZD-711 "Tests use a recorded PAO page saved in fixtures and the stub AI response"; S01 Property
// appraiser link "app reads parcel number, owner, legal description, year built, living area ... On read failure,
// offer 'Paste page text' or 'Paste screenshot'"; CLAUDE.md rule 5): the three appraiser read purposes in stub mode.
// Expected fields are the recorded page's (fixtures/pbc-page.ts); no live site or model is called.
import { afterEach, describe, expect, it } from 'vitest';
import { makeAiTestContext } from '../../../../test-harness/ai/context';
import { expectSafeToRunTwice } from '../../../../test-harness/jobs/run-twice';
import { clearStubRecordings, lastStubRequests, setStubRecording } from '../../ai/test-harness/stub';
import { PBC_FIXTURE_HTML, PBC_FIXTURE_URL } from '../../property-record/fixtures/pbc-page';
import { pageText, setAppraiserFetch } from '../../property-record/import';
import { getAiPurposes } from './index';
import { appraiserReadPurpose } from './property-appraiser-read';
import { appraiserRecording } from './property-appraiser-recording';
import { appraiserScreenshotPurpose, setAppraiserImageReader } from './property-appraiser-screenshot';
import { appraiserTextPurpose } from './property-appraiser-text';

const FIELDS = {
  parcelNo: '00-43-44-21-01-000-0010',
  owner: 'HENDRICKS FAMILY TRUST',
  legalDescription: 'GOLFVIEW HEIGHTS LT 10 BLK 2',
  yearBuilt: 1975,
  livingArea: 2140,
};

afterEach(() => {
  setAppraiserFetch(null);
  setAppraiserImageReader(null);
  clearStubRecordings();
});

const html = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { 'content-type': 'text/html', ...headers } });

describe('EZD-711 property appraiser read purposes', () => {
  it('are registered for production too', () => {
    const before = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = 'production';
    try {
      const names = Object.keys(getAiPurposes());
      expect(names).toEqual(
        expect.arrayContaining(['property_appraiser.read', 'property_appraiser.text', 'property_appraiser.screenshot']),
      );
      expect(names.filter((n) => n.startsWith('test.'))).toEqual([]);
    } finally {
      if (before === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = before;
    }
  });

  it('the recorded page text holds the five fields', () => {
    const text = pageText(PBC_FIXTURE_HTML);
    for (const v of ['00-43-44-21-01-000-0010', 'HENDRICKS FAMILY TRUST', 'GOLFVIEW HEIGHTS LT 10 BLK 2', '1975', '2,140']) {
      expect(text).toContain(v);
    }
    expect(text).not.toContain('analytics');
    expect(text).not.toContain('font-weight');
  });

  it('a link reads the recorded page and gives the five fields', async () => {
    const out = await appraiserReadPurpose.run(makeAiTestContext(), { url: PBC_FIXTURE_URL });
    expect(out).toEqual({ status: 'read', fields: FIELDS });
    const sent = JSON.stringify(lastStubRequests('anthropic'));
    expect(sent).toContain('HENDRICKS FAMILY TRUST');
  });

  it('a link to another site is unreadable and calls neither the site nor the model', async () => {
    let fetched = 0;
    setAppraiserFetch(async () => {
      fetched += 1;
      return html(PBC_FIXTURE_HTML);
    });
    const out = await appraiserReadPurpose.run(makeAiTestContext(), { url: 'https://example.com/parcel' });
    expect(out).toEqual({ status: 'unreadable' });
    expect(fetched).toBe(0);
    expect(lastStubRequests('anthropic')).toEqual([]);
  });

  it('a blocked read, a failed read and a redirect off the appraiser hosts are unreadable', async () => {
    setAppraiserFetch(async () => html('Forbidden', 403));
    expect(await appraiserReadPurpose.run(makeAiTestContext(), { url: PBC_FIXTURE_URL })).toEqual({
      status: 'unreadable',
    });
    setAppraiserFetch(async () => {
      throw new Error('network');
    });
    expect(await appraiserReadPurpose.run(makeAiTestContext(), { url: PBC_FIXTURE_URL })).toEqual({
      status: 'unreadable',
    });
    const asked: string[] = [];
    setAppraiserFetch(async (url) => {
      asked.push(url);
      return html('', 302, { location: 'https://evil.example/steal' });
    });
    expect(await appraiserReadPurpose.run(makeAiTestContext(), { url: PBC_FIXTURE_URL })).toEqual({
      status: 'unreadable',
    });
    expect(asked).toEqual([PBC_FIXTURE_URL]);
  });

  it('a redirect to another appraiser page is followed', async () => {
    const asked: string[] = [];
    setAppraiserFetch(async (url) => {
      asked.push(url);
      return asked.length === 1
        ? html('', 301, { location: '/Property/Details?parcelId=1' })
        : html(PBC_FIXTURE_HTML);
    });
    const out = await appraiserReadPurpose.run(makeAiTestContext(), { url: 'https://www.pbcpao.gov/x' });
    expect(out.status).toBe('read');
    expect(asked).toEqual(['https://www.pbcpao.gov/x', 'https://www.pbcpao.gov/Property/Details?parcelId=1']);
  });

  it('a page whose reply has no fields is unreadable', async () => {
    setStubRecording(
      'anthropic',
      'property_appraiser.read',
      appraiserRecording('property_appraiser.read', {
        parcelNo: null,
        owner: null,
        legalDescription: null,
        yearBuilt: null,
        livingArea: null,
      }),
    );
    expect(await appraiserReadPurpose.run(makeAiTestContext(), { url: PBC_FIXTURE_URL })).toEqual({
      status: 'unreadable',
    });
  });

  it('pasted page text gives the five fields', async () => {
    const out = await appraiserTextPurpose.run(makeAiTestContext(), { text: pageText(PBC_FIXTURE_HTML) });
    expect(out).toEqual({ status: 'read', fields: FIELDS });
    expect(appraiserTextPurpose.input.safeParse({ text: 'x'.repeat(12_001) }).success).toBe(false);
    expect(appraiserTextPurpose.input.safeParse({ text: '   ' }).success).toBe(false);
  });

  it('a screenshot gives the five fields and is sent as an image', async () => {
    setAppraiserImageReader(async () => new Uint8Array([137, 80, 78, 71]));
    const image = { bucket: 'jobs' as const, path: 't/tenant/property-appraiser/a/in/screenshot.png' };
    const out = await appraiserScreenshotPurpose.run(makeAiTestContext(), { image, mediaType: 'image/png' });
    expect(out).toEqual({ status: 'read', fields: FIELDS });
    expect(JSON.stringify(lastStubRequests('anthropic'))).toContain('image/png');
    setAppraiserImageReader(async () => null);
    expect(await appraiserScreenshotPurpose.run(makeAiTestContext(), { image, mediaType: 'image/png' })).toEqual({
      status: 'unreadable',
    });
    expect(
      appraiserScreenshotPurpose.input.safeParse({ image: { ...image, bucket: 'sources' }, mediaType: 'image/png' })
        .success,
    ).toBe(false);
  });

  it('a reply value outside the column limits is dropped, a "2,140" area is read as a number', async () => {
    setStubRecording(
      'anthropic',
      'property_appraiser.text',
      appraiserRecording('property_appraiser.text', { ...FIELDS, yearBuilt: 3000, livingArea: '2,140' }),
    );
    const out = await appraiserTextPurpose.run(makeAiTestContext(), { text: 'page' });
    expect(out).toEqual({ status: 'read', fields: { ...FIELDS, yearBuilt: null, livingArea: 2140 } });
  });

  it('the link read is safe to run twice', async () => {
    await expectSafeToRunTwice('ai_read', {
      payload: { purpose: 'property_appraiser.read', input: { url: PBC_FIXTURE_URL } },
    });
  });
});
