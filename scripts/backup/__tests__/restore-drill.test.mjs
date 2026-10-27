// EZD-025 T1 (Done when) and T12 (vault/plans/EZD-025.md Tests; Steps 4, 5, 6): the nightly files copy, the weekly
// dump and the restore run as child processes against the stub bucket and the local stack; a deleted test project
// comes back in the scratch stack (second Supabase stack, project_id ezdraft-restore, ports 55321/55322).
// Logs carry counts only (T12). The stub secret is `stub-secret-EZD025`. Expected values: plan T1 and T12.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startStubS3 } from './stub-s3.mjs';
import {
  REPO_ROOT,
  SCRATCH_DB_CONTAINER,
  SUPABASE_BIN,
  childEnv,
  cleanup,
  createDrillData,
  exec,
  inScope,
  query,
  runCli,
  stackStatus,
  storageApi,
  stubEnv,
} from './local-fixture.mjs';

const STUB_SECRET = 'stub-secret-EZD025';
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const newestMigration = () =>
  readdirSync(path.join(REPO_ROOT, 'supabase', 'migrations'))
    .map((f) => /^(\d{14})_/.exec(f)?.[1])
    .filter(Boolean)
    .sort()
    .at(-1);

describe(
  'EZD-025 restore drill',
  { skip: !inScope('EZD-025') },
  () => {
    let stub;
    let d;
    let env;
    let localSecretKey;
    let scratchWorkdir;
    const outputs = {};

    before(async () => {
      stub = await startStubS3({ bucket: 'ezd025-offsite', versioning: 'Enabled' });
      env = stubEnv(stub, { secret: STUB_SECRET });
      d = await createDrillData();
      localSecretKey = d.local.secretKey;
    });

    after(async () => {
      if (scratchWorkdir) {
        spawnSync(SUPABASE_BIN, ['stop', '--workdir', scratchWorkdir, '--no-backup'], {
          cwd: REPO_ROOT,
          env: childEnv(),
        });
      }
      await stub.stop();
      await cleanup();
    });

    test(
      'EZD-025 done when: the restore script brings back a deleted test project from the stub bucket',
      { timeout: 900_000 },
      async () => {
        const A = randomBytes(1_048_576);
        const B = Buffer.from('ezd-025');
        const aName = `${d.tenantId}/${d.projectId}/a.bin`;
        const bName = `${d.tenantId}/${d.projectId}/b.txt`;
        assert.equal((await d.api.upload(d.bucket, aName, A)).status, 200, 'upload a.bin');
        assert.equal((await d.api.upload(d.bucket, bName, B)).status, 200, 'upload b.txt');

        // (1) nightly copy
        const files = await runCli('scripts/backup/files.mjs', ['--local', '--only-bucket', d.bucket], env);
        outputs.files = files;
        assert.equal(files.code, 0, '(1) exit 0');
        const keyA = `files/${d.bucket}/${aName}`;
        const keyB = `files/${d.bucket}/${bName}`;
        assert.equal(Buffer.compare(stub.current(keyA)?.body ?? Buffer.alloc(0), A), 0, '(1) a.bin byte-identical');
        assert.equal(Buffer.compare(stub.current(keyB)?.body ?? Buffer.alloc(0), B), 0, '(1) b.txt byte-identical');

        // (2) weekly dump
        const knownPrefixes = new Set(stub.currentKeys('db/').map((k) => k.split('/').slice(0, 2).join('/')));
        const db = await runCli('scripts/backup/db.mjs', ['--local'], env);
        outputs.db = db;
        assert.equal(db.code, 0, '(2) exit 0');
        const after2 = new Set(stub.currentKeys('db/').map((k) => k.split('/').slice(0, 2).join('/')));
        const added = [...after2].filter((p) => !knownPrefixes.has(p));
        assert.equal(added.length, 1, '(2) exactly one new db/<ts>/ prefix');
        const prefix = `${added[0]}/`;
        assert.deepEqual(
          stub.currentKeys(prefix).map((k) => k.slice(prefix.length)).sort(),
          ['data.sql', 'manifest.json', 'roles.sql', 'schema.sql'],
          '(2) the prefix holds the three dump files and the manifest',
        );
        const manifest = JSON.parse(stub.current(`${prefix}manifest.json`).body.toString('utf8'));
        assert.equal(manifest.newest_migration, newestMigration(), '(2) manifest newest_migration');

        // delete the project and both objects at the source
        exec(`delete from public.project where id = '${d.projectId}';`);
        await d.api.remove(d.bucket, [aName, bName]);
        assert.equal(
          query(`select count(*)::int as n from public.project where id = '${d.projectId}'`)[0].n,
          0,
          '(2) the source has 0 rows for P',
        );

        // (3) restore
        const restore = await runCli(
          'scripts/backup/restore.mjs',
          ['--local', '--project', d.projectId, '--keep'],
          env,
          { timeoutMs: 850_000 },
        );
        outputs.restore = restore;
        scratchWorkdir = restore.last?.scratch?.workdir;
        assert.equal(restore.code, 0, '(3) exit 0');
        assert.equal(restore.last?.ok, true, '(3) ok true');
        assert.deepEqual(restore.last?.projects_found, [d.projectId], '(3) projects_found');
        assert.deepEqual(restore.last?.problems, [], '(3) no problems');

        // the scratch stack
        const q = (sql) => query(sql, SCRATCH_DB_CONTAINER);
        assert.deepEqual(
          q(`select name from public.project where id = '${d.projectId}'`),
          [{ name: `EZD-025 drill ${d.suffix}` }],
          'scratch project row',
        );
        assert.equal(
          q(`select count(*)::int as n from public.tenant where id = '${d.tenantId}'`)[0].n,
          1,
          'scratch tenant row',
        );
        assert.equal(
          q(`select count(*)::int as n from auth.users where email = '${d.email}'`)[0].n,
          1,
          'scratch auth user',
        );
        assert.equal(
          q('select max(version)::text as v from supabase_migrations.schema_migrations')[0].v,
          newestMigration(),
          'scratch max(version)',
        );
        assert.equal(
          q("select tgenabled::text as e from pg_trigger where tgname = 'sent_files_soft_delete'")[0]?.e,
          'O',
          'sent_files_soft_delete is enabled',
        );
        const scratchApi = storageApi({
          apiUrl: restore.last.scratch.apiUrl,
          secretKey: stackStatus(scratchWorkdir).secretKey,
        });
        const gotA = await scratchApi.download(d.bucket, aName);
        const gotB = await scratchApi.download(d.bucket, bName);
        assert.ok(gotA && gotB, 'both files download from scratch Storage');
        assert.equal(sha256(gotA), sha256(A), 'a.bin SHA-256');
        assert.equal(sha256(gotB), sha256(B), 'b.txt SHA-256');
        assert.equal(
          query(`select count(*)::int as n from public.project where id = '${d.projectId}'`)[0].n,
          0,
          'the source still has 0 rows for P',
        );
      },
    );

    test('EZD-025 T12 logs carry counts only', () => {
      const children = ['files', 'db', 'restore'];
      const uninspected = children.filter(
        (k) => !outputs[k] || typeof outputs[k].stdout !== 'string' || outputs[k].code === null,
      );
      assert.equal(uninspected.length, 0, 'every child output was captured');

      const forbidden = {
        'stub secret': STUB_SECRET,
        'local secret key': localSecretKey,
        'a.bin': 'a.bin',
        'b.txt': 'b.txt',
        'tenant id': d.tenantId,
        'project id': d.projectId,
      };
      // Plan Interface contract (T1/T12): the restore's last line may carry P's id only inside `projects_found`
      // and `problems[].ref`. Those two fields are blanked in that one line; everything else is scanned.
      const scannable = (k) => {
        const { stdout, stderr, last } = outputs[k];
        if (k !== 'restore') return `${stdout}\n${stderr}`;
        const lines = stdout.split('\n');
        const at = lines.findLastIndex((l) => {
          try {
            return JSON.stringify(JSON.parse(l.trim())) === JSON.stringify(last);
          } catch {
            return false;
          }
        });
        assert.ok(at >= 0, 'the restore last JSON line was found');
        const blanked = {
          ...last,
          projects_found: [],
          problems: (last.problems ?? []).map((p) => ({ ...p, ref: '' })),
        };
        lines[at] = JSON.stringify(blanked);
        return `${lines.join('\n')}\n${stderr}`;
      };
      for (const k of children) {
        const text = scannable(k);
        for (const [label, value] of Object.entries(forbidden)) {
          assert.equal(text.includes(value), false, `${k} output does not contain the ${label}`);
        }
      }

      const lines = outputs.files.stdout.split('\n').filter((l) => l.trim() !== '');
      const lastLine = JSON.parse(lines.at(-1));
      assert.deepEqual(
        Object.keys(lastLine).sort(),
        ['bytes', 'copied', 'hidden', 'kind', 'ok', 'skipped'],
        'files CLI last line keys',
      );
    });
  },
);

// EZD-1704 D-1 and D-2 (vault/plans/EZD-1704.md section 4; D13): the phase re-run of the drill on a fresh dump, with the
// backup check run between the dump and the delete. A second top-level describe, so it runs after EZD-025's
// block (one scratch stack at a time). No --record (D13). The stub secret is `stub-secret-EZD1704`.
const STUB_SECRET_1704 = 'stub-secret-EZD1704';

describe(
  'EZD-1704 phase restore drill',
  { skip: !inScope('EZD-1704') },
  () => {
    let stub;
    let d;
    let env;
    let localSecretKey;
    let scratchWorkdir;
    const outputs = {};

    before(async () => {
      stub = await startStubS3({ bucket: 'ezd1704-offsite', versioning: 'Enabled' });
      env = stubEnv(stub, { secret: STUB_SECRET_1704 });
      d = await createDrillData();
      localSecretKey = d.local.secretKey;
    });

    after(async () => {
      if (scratchWorkdir) {
        spawnSync(SUPABASE_BIN, ['stop', '--workdir', scratchWorkdir, '--no-backup'], {
          cwd: REPO_ROOT,
          env: childEnv(),
        });
      }
      await stub.stop();
      await cleanup();
    });

    test(
      'EZD-1704 done when: the drill passes on a fresh dump and the backup check is current',
      { timeout: 900_000 },
      async () => {
        const A = randomBytes(1_048_576);
        const B = Buffer.from('ezd-1704');
        const aName = `${d.tenantId}/${d.projectId}/a.bin`;
        const bName = `${d.tenantId}/${d.projectId}/b.txt`;
        assert.equal((await d.api.upload(d.bucket, aName, A)).status, 200, 'upload a.bin');
        assert.equal((await d.api.upload(d.bucket, bName, B)).status, 200, 'upload b.txt');

        const files = await runCli('scripts/backup/files.mjs', ['--local', '--only-bucket', d.bucket], env);
        outputs.files = files;
        assert.equal(files.code, 0, 'files exit 0');

        const known = new Set(stub.currentKeys('db/').map((k) => k.split('/').slice(0, 2).join('/')));
        const db = await runCli('scripts/backup/db.mjs', ['--local'], env);
        outputs.db = db;
        assert.equal(db.code, 0, 'db exit 0');
        const now2 = new Set(stub.currentKeys('db/').map((k) => k.split('/').slice(0, 2).join('/')));
        const added = [...now2].filter((p) => !known.has(p));
        assert.equal(added.length, 1, 'exactly one new db/<ts>/ prefix');
        const prefix = `${added[0]}/`;
        const manifest = JSON.parse(stub.current(`${prefix}manifest.json`).body.toString('utf8'));
        assert.equal(manifest.newest_migration, newestMigration(), 'manifest newest_migration');

        const check = await runCli('scripts/backup/check.mjs', ['--local', '--only-bucket', d.bucket], env);
        outputs.check = check;
        assert.equal(check.code, 0, 'check exit 0');
        assert.equal(check.last?.ok, true, 'check ok');
        assert.deepEqual(check.last?.stale, [], 'check stale empty');

        exec(`delete from public.project where id = '${d.projectId}';`);
        await d.api.remove(d.bucket, [aName, bName]);

        const restore = await runCli(
          'scripts/backup/restore.mjs',
          ['--local', '--project', d.projectId, '--dump', prefix, '--keep'],
          env,
          { timeoutMs: 850_000 },
        );
        outputs.restore = restore;
        scratchWorkdir = restore.last?.scratch?.workdir;
        assert.equal(restore.code, 0, 'restore exit 0');
        assert.equal(restore.last?.ok, true, 'restore ok');
        assert.equal(restore.last?.dump, prefix, 'restore dump');
        assert.equal(restore.last?.newest_migration, newestMigration(), 'restore newest_migration');
        assert.deepEqual(restore.last?.projects_found, [d.projectId], 'projects_found');
        assert.deepEqual(restore.last?.problems, [], 'no problems');
        assert.equal(restore.last?.files_restored, 2, 'files_restored');
        assert.equal(restore.last?.files_checked, 2, 'files_checked');
        assert.equal(restore.last?.orphan_rows, 0, 'orphan_rows');

        const q = (sql) => query(sql, SCRATCH_DB_CONTAINER);
        assert.deepEqual(
          q(`select name from public.project where id = '${d.projectId}'`),
          [{ name: `EZD-025 drill ${d.suffix}` }],
          'scratch project row',
        );
        const scratchApi = storageApi({
          apiUrl: restore.last.scratch.apiUrl,
          secretKey: stackStatus(scratchWorkdir).secretKey,
        });
        const gotA = await scratchApi.download(d.bucket, aName);
        const gotB = await scratchApi.download(d.bucket, bName);
        assert.ok(gotA && gotB, 'both files download from scratch Storage');
        assert.equal(sha256(gotA), sha256(A), 'a.bin SHA-256');
        assert.equal(sha256(gotB), sha256(B), 'b.txt SHA-256');
        assert.equal(
          query(`select count(*)::int as n from public.project where id = '${d.projectId}'`)[0].n,
          0,
          'the source still has 0 rows for P',
        );
      },
    );

    test('EZD-1704 D-2 logs carry counts and codes only', () => {
      const children = ['files', 'db', 'check', 'restore'];
      for (const k of children) {
        assert.ok(outputs[k] && typeof outputs[k].stdout === 'string', `${k} output captured`);
      }
      const forbidden = {
        'stub secret': STUB_SECRET_1704,
        'local secret key': localSecretKey,
        'a.bin': 'a.bin',
        'b.txt': 'b.txt',
        'tenant id': d.tenantId,
        'project id': d.projectId,
      };
      const scannable = (k) => {
        const { stdout, stderr, last } = outputs[k];
        if (k !== 'restore') return `${stdout}\n${stderr}`;
        const lines = stdout.split('\n');
        const at = lines.findLastIndex((l) => {
          try {
            return JSON.stringify(JSON.parse(l.trim())) === JSON.stringify(last);
          } catch {
            return false;
          }
        });
        assert.ok(at >= 0, 'the restore last JSON line was found');
        lines[at] = JSON.stringify({
          ...last,
          projects_found: [],
          problems: (last.problems ?? []).map((p) => ({ ...p, ref: '' })),
        });
        return `${lines.join('\n')}\n${stderr}`;
      };
      for (const k of children) {
        const text = scannable(k);
        for (const [label, value] of Object.entries(forbidden)) {
          assert.equal(text.includes(value), false, `${k} output does not contain the ${label}`);
        }
      }
      assert.deepEqual(
        Object.keys(outputs.check.last).sort(),
        ['db_dump_succeeded_at', 'files_succeeded_at', 'kind', 'ok', 'stale'],
        'check last line keys',
      );
    });
  },
);
