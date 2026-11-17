// EZD-111 (vault/plans/EZD-111.md D-Token, P111 S1; 09p Token #1; Q-0700 10 row; 03b rule 11): the client-link
// token. 32 random bytes as base64url without padding (43 characters); only its SHA-256, 64 lower-case hex
// characters, is passed to the database. The token itself is never stored, logged or reported.
import { createHash, randomBytes } from 'node:crypto';

export const CLIENT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function hashClientToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newClientToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashClientToken(token) };
}

export function isClientToken(value: unknown): value is string {
  return typeof value === 'string' && CLIENT_TOKEN_PATTERN.test(value);
}

export function clientLinkPath(token: string): string {
  return '/c/' + token;
}
