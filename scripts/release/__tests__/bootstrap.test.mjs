// EZD-023d T9 pure cases, (h), (i) (vault/plans/EZD-023d.md section 4). node:test, Node 22 built-ins only.
// `renderBootstrap` and the Step 4 constants; nothing reaches a database. The fixture file is a copy of
// release.test.mjs's C1_FILES['supabase/bootstrap/tenant-1.sql'] (importing that file would run its tests).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './git-fixture.mjs';

const loadBootstrap = () => import('../bootstrap.mjs');

const PLACEHOLDER = 'PASTE-YOUR-EMAIL-HERE';
const FIXTURE_FILE =
  "do $$ declare owner_email text := 'PASTE-YOUR-EMAIL-HERE'; begin raise notice 'ezd_bootstrap_done'; end $$;\n";

// Step 4 text and values (plan section 3 "Step 4 text and values").
const TENANT_CHECK_SQL_EXPECTED = `select to_regclass('public.tenant') is not null as has_tenant \\gset
\\if :has_tenant
select (select count(*) from public.tenant where id = '00000000-0000-4000-8000-000000000001') || ' ' || (select setting from pg_catalog.pg_settings where name = 'lock_timeout') || ' ' || (select setting from pg_catalog.pg_settings where name = 'statement_timeout');
\\else
select '0 ' || (select setting from pg_catalog.pg_settings where name = 'lock_timeout') || ' ' || (select setting from pg_catalog.pg_settings where name = 'statement_timeout');
\\endif`;
const OWNER_EMAIL_RE_SOURCE = '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$';

const count = (text, needle) => text.split(needle).length - 1;
const throwsCode = (fn, code, id) => {
  assert.throws(fn, (err) => err instanceof Error && err.code === code, `(${id}) throws .code ${code}`);
};

describe('EZD-023d bootstrap rendering', () => {
  test('EZD-023d T9 pure: renderBootstrap replaces the one placeholder and refuses bad files and emails', async () => {
    const bs = await loadBootstrap();

    // Step 4 constants.
    assert.equal(bs.BOOTSTRAP_PATH, 'supabase/bootstrap/tenant-1.sql', 'BOOTSTRAP_PATH');
    assert.ok(bs.OWNER_EMAIL_RE instanceof RegExp, 'OWNER_EMAIL_RE is a RegExp');
    assert.equal(bs.OWNER_EMAIL_RE.source, OWNER_EMAIL_RE_SOURCE, 'OWNER_EMAIL_RE pattern');
    assert.equal(typeof bs.TENANT_CHECK_SQL, 'string', 'TENANT_CHECK_SQL is a string');
    assert.equal(bs.TENANT_CHECK_SQL.trim(), TENANT_CHECK_SQL_EXPECTED, 'TENANT_CHECK_SQL text');

    // The fixture file with a padded, mixed-case email: trimmed, case kept, exactly one replacement.
    {
      const out = bs.renderBootstrap(FIXTURE_FILE, ' Owner@Example.com ');
      assert.equal(count(out, "'Owner@Example.com'"), 1, "contains 'Owner@Example.com' exactly once");
      assert.equal(count(out, PLACEHOLDER), 0, 'no placeholder left');
    }

    // No placeholder, or the placeholder twice: the file is not the contract file.
    throwsCode(
      () => bs.renderBootstrap("do $$ begin raise notice 'ezd_bootstrap_done'; end $$;\n", 'a@b.com'),
      'bootstrap_file_invalid',
      'no placeholder',
    );
    throwsCode(
      () => bs.renderBootstrap(FIXTURE_FILE + FIXTURE_FILE, 'a@b.com'),
      'bootstrap_file_invalid',
      'placeholder twice',
    );

    // (h) the committed file: one replacement; its own lower-case guard text stays (finding V6).
    {
      const committed = readFileSync(path.join(REPO_ROOT, 'supabase', 'bootstrap', 'tenant-1.sql'), 'utf8');
      assert.equal(count(committed, PLACEHOLDER), 1, '(h) the committed file holds the placeholder once');
      const out = bs.renderBootstrap(committed, 'owner.test@example.com');
      assert.equal(count(out, 'owner.test@example.com'), 1, '(h) email exactly once');
      assert.equal(count(out, PLACEHOLDER), 0, '(h) no PASTE-YOUR-EMAIL-HERE');
      assert.ok(out.includes("'paste-your-email-here'"), "(h) still contains 'paste-your-email-here'");
    }

    // (i) a quote in the email is refused (STATUS.md row EZD-005b), and the error never holds the email.
    {
      let caught = null;
      try {
        bs.renderBootstrap(FIXTURE_FILE, "josh'@example.com");
      } catch (err) {
        caught = err;
      }
      assert.ok(caught instanceof Error, '(i) throws');
      assert.equal(caught.code, 'owner_email_missing', '(i) .code');
      assert.ok(!caught.message.includes('josh'), '(i) the message never holds the email');
    }
  });
});
