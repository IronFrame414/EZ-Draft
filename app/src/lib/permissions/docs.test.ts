// EZD-101 T12 (vault/plans/EZD-101.md section 4): the architecture doc names the new tables and guard.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

describe('EZD-101 architecture docs', () => {
  const doc = readFileSync(path.join(repoRoot, 'docs', 'architecture.md'), 'utf8');

  it('T12 docs: the subsection and its five names', () => {
    expect(doc).toContain('### Permissions and roles (EZD-101)');
    const after = doc.slice(doc.indexOf('### Permissions and roles (EZD-101)'));
    for (const name of [
      'user_permission',
      'role_preset_guard',
      'preset_role_change_refused',
      'settings_system_status',
      'Q-0234',
    ]) {
      expect(after, name).toContain(name);
    }
  });

  it('T12 docs: the old ownerAlertRecipients promise is gone', () => {
    expect(doc).not.toContain('switches `ownerAlertRecipients` to the permission key');
  });
});
