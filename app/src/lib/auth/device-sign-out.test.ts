// EZD-120d U8 (vault/plans/EZD-120d.md sections 3 and 4; AC-EZD-120d-2; Q-0581; Q-0048 (a)). `signOutOnDevice`
// with a fake document and location. Expected values: a sign-out that works writes nothing; one that rejects
// (server unreachable) writes the marker cookie (400 days = 34,560,000 s, `; Secure` on https), then replaces
// the location with /sign-in and never rejects.
import { describe, expect, it, vi } from 'vitest';
import { SIGNED_OUT_COOKIE, signOutOnDevice, signedOutCookieName } from './device-sign-out';

function fakeEnv(protocol: 'http:' | 'https:') {
  const writes: string[] = [];
  const replace = vi.fn();
  const env = {
    document: {
      get cookie() {
        return '';
      },
      set cookie(value: string) {
        writes.push(value);
      },
    },
    location: { protocol, replace },
  };
  return { env, writes, replace };
}

describe('EZD-120d device sign-out', () => {
  it('U8 names the marker cookie ezd_signed_out', () => {
    expect(SIGNED_OUT_COOKIE).toBe('ezd_signed_out');
  });

  it('U8 writes nothing when the sign-out action resolves', async () => {
    const f = fakeEnv('https:');
    await signOutOnDevice(async () => 'ok', f.env);
    expect(f.writes).toEqual([]);
    expect(f.replace).not.toHaveBeenCalled();
  });

  it('U8 writes the marker and goes to /sign-in when the action rejects on http', async () => {
    const f = fakeEnv('http:');
    await expect(
      signOutOnDevice(async () => {
        throw new Error('offline');
      }, f.env),
    ).resolves.toBeUndefined();
    expect(f.writes).toEqual(['ezd_signed_out=1; Path=/; Max-Age=34560000; SameSite=Lax']);
    expect(f.replace).toHaveBeenCalledTimes(1);
    expect(f.replace).toHaveBeenCalledWith('/sign-in');
  });

  it('U8 signedOutCookieName is __Host- on https only', () => {
    expect(signedOutCookieName(true)).toBe('__Host-ezd_signed_out');
    expect(signedOutCookieName(false)).toBe('ezd_signed_out');
  });

  it('U8 rethrows a Next redirect error unchanged, with no cookie and no replace', async () => {
    const f = fakeEnv('https:');
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/sign-in;307;',
    });
    await expect(
      signOutOnDevice(async () => {
        throw redirect;
      }, f.env),
    ).rejects.toBe(redirect);
    expect(f.writes).toEqual([]);
    expect(f.replace).not.toHaveBeenCalled();
  });

  it('U8 uses the __Host- name with Secure on https', async () => {
    const f = fakeEnv('https:');
    await expect(
      signOutOnDevice(async () => {
        throw new Error('offline');
      }, f.env),
    ).resolves.toBeUndefined();
    expect(f.writes).toEqual([
      '__Host-ezd_signed_out=1; Path=/; Secure; Max-Age=34560000; SameSite=Lax',
    ]);
    expect(f.replace).toHaveBeenCalledWith('/sign-in');
  });
});

// EZD-342 D1 (vault/plans/EZD-342.md section 4; AC-EZD-342-1; Q-0599; EZD-120d U8): the marker writer on https.
describe('EZD-342 marker name', () => {
  it('D1 the https marker write is exactly the __Host- cookie, with no Domain', async () => {
    const f = fakeEnv('https:');
    await signOutOnDevice(async () => {
      throw new Error('offline');
    }, f.env);
    expect(f.writes).toEqual([
      '__Host-ezd_signed_out=1; Path=/; Secure; Max-Age=34560000; SameSite=Lax',
    ]);
    expect(f.writes[0]).not.toContain('Domain');
  });
});
