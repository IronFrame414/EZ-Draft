// EZD-121 (AC-EZD-121-5; Q-0700 05 row "Versions labels"; R24 #26; board S03 / S20 "Working copy · Rev 0
// issued"): the header's version text, rendered with the real office catalog. The Rev forms exist and are
// tested here; nothing in the app passes a rev until EZD-717.
import { describe, expect, it } from 'vitest';
import { createT } from '../lib/messages';
import { catalogFor } from '../server/messages/catalog';
import { newerVersionNo, versionLabel, type VersionLabelState } from './version-label';
import { versionSentOf } from './version-sent';

const t = createT('en', catalogFor('office', 'en') as Record<string, string>);
const text = (state: VersionLabelState) => {
  const l = versionLabel(state);
  return t(l.key, l.params);
};

describe('EZD-121 header version text', () => {
  it('reads Working copy before any send', () => {
    expect(text({ lastSent: null })).toBe('Working copy');
    expect(text({ lastSent: null, viewing: null })).toBe('Working copy');
  });
  it('reads "Working copy · Version N sent" after a send', () => {
    expect(text({ lastSent: { kind: 'version', no: 1 } })).toBe('Working copy · Version 1 sent');
    expect(text({ lastSent: { kind: 'version', no: 150 } })).toBe('Working copy · Version 150 sent');
  });
  it('reads "Version N" while that sent version is open read-only', () => {
    expect(
      text({ lastSent: { kind: 'version', no: 3 }, viewing: { kind: 'version', no: 2 } }),
    ).toBe('Version 2');
  });
  it('builds the Rev forms (unreachable until EZD-717)', () => {
    expect(text({ lastSent: { kind: 'rev', no: 0 } })).toBe('Working copy · Rev 0 issued');
    expect(text({ lastSent: { kind: 'rev', no: 1 }, viewing: { kind: 'rev', no: 0 } })).toBe('Rev 0');
  });
  it('keeps the newest number from the load, a send and a broadcast', () => {
    expect(newerVersionNo(null, null)).toBeNull();
    expect(newerVersionNo(null, 1)).toBe(1);
    expect(newerVersionNo(3, null)).toBe(3);
    expect(newerVersionNo(3, 2)).toBe(3);
    expect(newerVersionNo(2, 3)).toBe(3);
  });
  it('reads the version.sent payload number and refuses anything else', () => {
    expect(versionSentOf({ modelVersionId: 'v', versionNo: 4, sentAt: 'x' })).toBe(4);
    expect(versionSentOf({ versionNo: 0 })).toBeNull();
    expect(versionSentOf({ versionNo: '4' })).toBeNull();
    expect(versionSentOf(null)).toBeNull();
  });
});
