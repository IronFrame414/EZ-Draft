// EZD-105 token module (Q-0695 decisions 10 row 61; architecture "Password sign-in (EZD-033)" (vii)): the link
// token and the 6-digit code come from the invite's random value and a server-held key, so the same value
// gives the same link and code (shown again on the pending row), two invites differ, the code is six digits,
// the lookup key is the token's lower-case hex sha-256, and the link is the absolute /invite/<token> URL.
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  inviteCode,
  inviteLink,
  inviteToken,
  inviteTokenHash,
  isInviteToken,
  newInviteSecret,
} from './invite-token';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('EZD-105 invite token', () => {
  it('T1 the same value gives the same token and code; two values differ', () => {
    const a = newInviteSecret();
    const b = newInviteSecret();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(inviteToken(a)).toBe(inviteToken(a));
    expect(inviteCode(a)).toBe(inviteCode(a));
    expect(inviteToken(a)).not.toBe(inviteToken(b));
    expect(isInviteToken(inviteToken(a))).toBe(true);
    expect(inviteToken(a)).not.toContain(a);
  });

  it('T2 the code is six ASCII digits with leading zeros kept', () => {
    const codes = Array.from({ length: 200 }, () => inviteCode(newInviteSecret()));
    for (const c of codes) expect(c).toMatch(/^[0-9]{6}$/);
    expect(new Set(codes).size).toBeGreaterThan(190);
  });

  it('T3 the token and code depend on the server key', () => {
    const s = newInviteSecret();
    const token = inviteToken(s);
    vi.stubEnv('SUPABASE_API_GATE_SECRET', 'b'.repeat(43));
    expect(inviteToken(s)).not.toBe(token);
    vi.stubEnv('SUPABASE_API_GATE_SECRET', undefined);
    expect(() => inviteToken(s)).toThrow('api_gate_secret_not_set');
    expect(() => inviteCode(s)).toThrow('api_gate_secret_not_set');
  });

  it('T4 the lookup key is the lower-case hex sha-256 of the token', () => {
    const token = inviteToken(newInviteSecret());
    expect(inviteTokenHash(token)).toBe(createHash('sha256').update(token).digest('hex'));
    expect(inviteTokenHash('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('T5 the link is the absolute /invite/<token> URL of the app', () => {
    expect(inviteLink('tok', { VERCEL_ENV: 'production' })).toBe(
      'https://ezdraft.ezcontractorbinder.com/invite/tok',
    );
    expect(inviteLink('tok', {})).toBe('http://localhost:3000/invite/tok');
  });

  it('T6 only 43 base64url characters are a token', () => {
    expect(isInviteToken('A'.repeat(43))).toBe(true);
    for (const bad of ['', 'A'.repeat(42), 'A'.repeat(44), `${'A'.repeat(42)}/`, `${'A'.repeat(42)}=`]) {
      expect(isInviteToken(bad), bad).toBe(false);
    }
  });
});
