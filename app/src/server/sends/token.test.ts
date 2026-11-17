// EZD-111 U1 (vault/plans/EZD-111.md section 4; AC-EZD-111-4, -8). Expected values: 09p Token #1 and Q-0700
// (32 bytes, base64url, SHA-256 hex) and the FIPS 180-2 SHA-256 test vector for "abc".
import { describe, expect, it } from 'vitest';
import {
  CLIENT_TOKEN_PATTERN,
  clientLinkPath,
  hashClientToken,
  isClientToken,
  newClientToken,
} from './token';

describe('EZD-111 client-link token', () => {
  it('U1 makes a 43-character base64url token with its lower-case hex SHA-256, and checks the shape', () => {
    const a = newClientToken();
    const b = newClientToken();
    for (const t of [a, b]) {
      expect(t.token).toMatch(CLIENT_TOKEN_PATTERN);
      expect(t.hash).toBe(hashClientToken(t.token));
      expect(t.hash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(a.token).not.toBe(b.token);
    expect(hashClientToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(isClientToken('A'.repeat(43))).toBe(true);
    for (const v of ['A'.repeat(42), 'A'.repeat(44), 'A'.repeat(42) + '+', 'A'.repeat(42) + '/', '', 43]) {
      expect(isClientToken(v)).toBe(false);
    }
    expect(clientLinkPath('xyz')).toBe('/c/xyz');
  });
});
