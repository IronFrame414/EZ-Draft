// EZD-2010 M1-M3 (AC-EZD-2010-1, AC-EZD-2010-2; flaky-test audit 2026-11-27 row 3; EZD-120d B5). The CI trace of
// run 45763424921 shows the /sign-in request of an offline sign-out leaving with the session cookie but without
// ezd_signed_out=1. Cause: Chrome takes a `document.cookie` write without waiting for its cookie store, and only
// a read of `document.cookie` waits for it. The fake document below has that same late store: a write is pending
// until the cookies are read. Expected: the marker is in the store at the moment the page goes to /sign-in
// (EZD-120d plan section 3: the marker is written, then the page goes to /sign-in).
import { describe, expect, it } from 'vitest';
import { signOutOnDevice } from './device-sign-out';

function lateStoreEnv(protocol: 'http:' | 'https:') {
  const pending: string[] = [];
  const stored: string[] = [];
  const steps: string[] = [];
  const storedAtReplace: string[][] = [];
  const env = {
    document: {
      get cookie() {
        steps.push('read');
        stored.push(...pending.splice(0).map((write) => write.split(';')[0]));
        return stored.join('; ');
      },
      set cookie(value: string) {
        steps.push('write');
        pending.push(value);
      },
    },
    location: {
      protocol,
      replace(url: string) {
        steps.push(`replace ${url}`);
        storedAtReplace.push([...stored]);
      },
    },
  };
  return { env, steps, storedAtReplace };
}

const offline = async () => {
  throw new Error('offline');
};

describe('EZD-2010 the marker is stored before the page goes to /sign-in', () => {
  it('M1 on http the store holds ezd_signed_out=1 when the location is replaced', async () => {
    const f = lateStoreEnv('http:');
    await signOutOnDevice(offline, f.env);
    expect(f.storedAtReplace).toEqual([['ezd_signed_out=1']]);
  });

  it('M2 on https the store holds __Host-ezd_signed_out=1 when the location is replaced', async () => {
    const f = lateStoreEnv('https:');
    await signOutOnDevice(offline, f.env);
    expect(f.storedAtReplace).toEqual([['__Host-ezd_signed_out=1']]);
  });

  it('M3 the order is one write, a read, then one replace to /sign-in', async () => {
    const f = lateStoreEnv('http:');
    await signOutOnDevice(offline, f.env);
    expect(f.steps).toEqual(['write', 'read', 'replace /sign-in']);
  });
});
