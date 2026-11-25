// EZD-606 (AC-EZD-606-1 "With the stub AI provider returning brand, rating and spaces ..."; S06 Controls "Existing
// panel ... panel label photo (AI reads brand, rating, spaces; user confirms), existing circuit list (typed or read
// from directory photo ...)"; Q-0637 photo row; CLAUDE.md rule 5): the two panel photo reads in stub mode. The stub
// replies are the recordings' (panel-read-recording.ts); no live model is called.
import { afterEach, describe, expect, it } from 'vitest';
import { makeAiTestContext } from '../../../../test-harness/ai/context';
import { expectSafeToRunTwice } from '../../../../test-harness/jobs/run-twice';
import {
  clearStubRecordings,
  lastStubRequests,
  setStubRecording,
} from '../../ai/test-harness/stub';
import { getAiPurposes } from './index';
import { panelDirectoryPurpose, panelLabelPurpose, setPanelImageReader } from './panel-read';
import { panelRecording } from './panel-read-recording';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const image = { bucket: 'sources' as const, path: 't/p/8b2f1d4e-6c3a-4f9b-8d72-1e5a4c3b2f77' };

afterEach(() => {
  setPanelImageReader(null);
  clearStubRecordings();
});

describe('EZD-606 panel photo reads', () => {
  it('are registered for production too', () => {
    const before = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = 'production';
    try {
      expect(Object.keys(getAiPurposes())).toEqual(
        expect.arrayContaining(['panel.label', 'panel.directory']),
      );
    } finally {
      if (before === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = before;
    }
  });

  it('AC-1 the label read answers the stub brand, rating and spaces and sends the photo as an image', async () => {
    setPanelImageReader(async () => JPEG);
    const out = await panelLabelPurpose.run(makeAiTestContext(), {
      image,
      mediaType: 'image/jpeg',
    });
    expect(out).toEqual({ status: 'read', label: { brand: 'Square D', rating: 200, spaces: 40 } });
    expect(JSON.stringify(lastStubRequests('anthropic'))).toContain('image/jpeg');
  });

  it('the type sent is the one the first bytes show', async () => {
    setPanelImageReader(async () => PNG);
    await panelLabelPurpose.run(makeAiTestContext(), { image, mediaType: 'image/jpeg' });
    expect(JSON.stringify(lastStubRequests('anthropic'))).toContain('image/png');
  });

  it('a missing, empty, oversized or HEIC photo is unreadable and calls no model', async () => {
    const heic = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99]);
    for (const bytes of [null, new Uint8Array(0), heic, new Uint8Array(4_000_001).fill(0xff)]) {
      setPanelImageReader(async () => bytes);
      expect(
        await panelLabelPurpose.run(makeAiTestContext(), { image, mediaType: 'image/jpeg' }),
      ).toEqual({ status: 'unreadable' });
    }
    expect(lastStubRequests('anthropic')).toEqual([]);
  });

  it('takes only a sources bucket photo of JPEG or PNG', () => {
    expect(panelLabelPurpose.input.safeParse({ image, mediaType: 'image/jpeg' }).success).toBe(
      true,
    );
    expect(
      panelLabelPurpose.input.safeParse({
        image: { ...image, bucket: 'jobs' },
        mediaType: 'image/jpeg',
      }).success,
    ).toBe(false);
    expect(panelLabelPurpose.input.safeParse({ image, mediaType: 'image/heic' }).success).toBe(
      false,
    );
  });

  it('a label reply with nothing in it is unreadable; "200A" reads as 200; spaces past 84 are dropped', async () => {
    setPanelImageReader(async () => JPEG);
    setStubRecording(
      'anthropic',
      'panel.label',
      panelRecording('panel.label', { brand: null, rating: null, spaces: null }),
    );
    expect(
      await panelLabelPurpose.run(makeAiTestContext(), { image, mediaType: 'image/jpeg' }),
    ).toEqual({
      status: 'unreadable',
    });
    setStubRecording(
      'anthropic',
      'panel.label',
      panelRecording('panel.label', { brand: ' Eaton ', rating: '200A', spaces: 90 }),
    );
    expect(
      await panelLabelPurpose.run(makeAiTestContext(), { image, mediaType: 'image/jpeg' }),
    ).toEqual({
      status: 'read',
      label: { brand: 'Eaton', rating: 200, spaces: null },
    });
  });

  it('the directory read answers the stub circuits in space order', async () => {
    setPanelImageReader(async () => JPEG);
    const out = await panelDirectoryPurpose.run(makeAiTestContext(), {
      image,
      mediaType: 'image/jpeg',
    });
    expect(out).toEqual({
      status: 'read',
      circuits: [
        { space: 1, name: 'Range', breaker: 40, poles: 2 },
        { space: 2, name: 'Kitchen counter', breaker: 20, poles: 1 },
        { space: 4, name: 'Bedrooms', breaker: 15, poles: 1 },
      ],
    });
  });

  it('a directory line with no space or breaker, or a repeated space, is left out', async () => {
    setPanelImageReader(async () => JPEG);
    setStubRecording(
      'anthropic',
      'panel.directory',
      panelRecording('panel.directory', {
        circuits: [
          { space: 3, name: 'Dryer', breaker: 30, poles: 2 },
          { space: null, name: 'Spare', breaker: 20, poles: 1 },
          { space: 3, name: 'Again', breaker: 20, poles: 1 },
          { space: 5, name: 'Lights', breaker: null, poles: 1 },
        ],
      }),
    );
    expect(
      await panelDirectoryPurpose.run(makeAiTestContext(), { image, mediaType: 'image/jpeg' }),
    ).toEqual({ status: 'read', circuits: [{ space: 3, name: 'Dryer', breaker: 30, poles: 2 }] });
  });

  it('both reads are safe to run twice', async () => {
    setPanelImageReader(async () => JPEG);
    await expectSafeToRunTwice('ai_read', {
      payload: { purpose: 'panel.label', input: { image, mediaType: 'image/jpeg' } },
    });
    await expectSafeToRunTwice('ai_read', {
      payload: { purpose: 'panel.directory', input: { image, mediaType: 'image/jpeg' } },
    });
  });
});
