// EZD-298 (vault/plans/EZD-298.md sections 3 and 4): the released migration 20261020101101 is
// byte-identical to its text on origin/main. A released migration is never edited; a change to it
// is a new migration (rule 17, 18). The expected values are the git blob id and the SHA-256 that
// the plan cites from origin/main (a1506abf) and from commit 54bb4d44^, 2026-11-02.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const MIGRATION = 'supabase/migrations/20261020101101_create_unconfirmed_password_guard.sql';
const RELEASED_BLOB = '2f7018483d6c355b763be5c6941244785afb0c02';

describe('EZD-298 released migration is restored to its released text', () => {
  it('EZD-298 T1 released guard migration is byte-identical to origin/main', () => {
    const bytes = readFileSync(path.join(root, MIGRATION));
    assert.equal(bytes.length, 1161);
    const blob = createHash('sha1')
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest('hex');
    assert.equal(blob, RELEASED_BLOB);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha256, '0681300909fd3006ba5aa0bf6489c419c7561806b101b63e327ab40499a3b7ba');
  });
});
