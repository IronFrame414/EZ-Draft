// EZD-172 L1-L16 (vault/plans/EZD-172.md sections 3 and 4): build lanes. node:test, Node 22 built-ins only.
// Expected ports are the committed supabase/config.toml values (and the scratch config's) plus 100 x lane;
// app ports are web 3000 + 10 x lane and perf 3200 + 10 x lane (plan Decided "App ports").
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  copyFileSync,
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const url = (...p) => pathToFileURL(path.join(repo, ...p)).href;
const read = (...p) => readFileSync(path.join(repo, ...p), 'utf8');
const lane = await import(url('scripts', 'db', 'lane.mjs'));
const committed = read('supabase', 'config.toml');
const localScript = path.join(repo, 'scripts', 'db', 'local.mjs');

// The first uncommented port line of each section, from the plan's values row (lane 0).
const BASE_PORTS = {
  api: 54321,
  db: 54322,
  shadow: 54320,
  pooler: 54329,
  studio: 54323,
  mail: 54324,
  analytics: 54327,
  inspector: 8083,
};
// 1-based line numbers of the 8 port lines of the committed config (plan Decided "Stack ports").
const PORT_LINES = [10, 34, 36, 48, 98, 109, 414, 423];

function cleanEnv(extra = {}) {
  const env = { ...process.env };
  delete env.EZD_TEST_GREP;
  delete env.EZD_PHASE;
  delete env.NODE_TEST_CONTEXT;
  delete env.EZD_LANE;
  delete env.SUPABASE_WORKDIR;
  return { ...env, EZD_GATE_AS_SELF: '1', ...extra }; // EZD-354 D4: a fixture gate runs as itself
}

const expectedPorts = (n) =>
  Object.fromEntries(Object.entries(BASE_PORTS).map(([k, v]) => [k, v + 100 * n]));

describe('EZD-172 build lanes', () => {
  test('EZD-172 L1 readLane', () => {
    assert.equal(lane.readLane({}), 0);
    assert.equal(lane.readLane({ EZD_LANE: '' }), 0);
    assert.equal(lane.readLane({ EZD_LANE: '0' }), 0);
    assert.equal(lane.readLane({ EZD_LANE: '1' }), 1);
    assert.equal(lane.readLane({ EZD_LANE: '2' }), 2);
    assert.equal(lane.readLane({ EZD_LANE: '3' }), 3);
    for (const v of ['4', '-1', '01', ' 1', 'a', '1.0']) {
      assert.throws(
        () => lane.readLane({ EZD_LANE: v }),
        (e) =>
          e.code === 'lane_invalid' && e.message === `EZD_LANE must be 0, 1, 2 or 3 (got "${v}").`,
        `value ${JSON.stringify(v)}`,
      );
    }
  });

  test('EZD-172 L2 laneConfigToml', () => {
    assert.equal(lane.MAX_LANE, 3);
    assert.equal(lane.STACK_PORT_STEP, 100);
    assert.equal(lane.APP_PORT_STEP, 10);
    assert.equal(lane.BASE_WEB_PORT, 3000);
    assert.equal(lane.BASE_PERF_PORT, 3200);
    assert.equal(lane.LANES_DIR, '.lanes');
    const src = committed.split('\n');
    assert.ok(committed.includes('# smtp_port = 54325'), 'committed config has the commented smtp_port');
    for (const n of [1, 2, 3]) {
      const out = lane.laneConfigToml(committed, n).split('\n');
      assert.equal(out.length, src.length, 'same line count');
      const web = 3000 + 10 * n;
      let changed = 0;
      src.forEach((line, i) => {
        const ln = i + 1;
        const m = /^(\s*)([a-z_]*port)(\s*=\s*)(\d+)\s*$/.exec(line);
        if (PORT_LINES.includes(ln)) {
          assert.ok(m, `line ${ln} is a port line: ${line}`);
          assert.equal(out[i], `${m[1]}${m[2]}${m[3]}${Number(m[4]) + 100 * n}`, `port line ${ln}`);
        } else if (/^\s*project_id\s*=/.test(line)) {
          assert.equal(out[i], `project_id = "ezdraft-lane${n}"`);
        } else if (line === 'site_url = "http://127.0.0.1:3000"') {
          assert.equal(out[i], `site_url = "http://127.0.0.1:${web}"`);
        } else if (/^additional_redirect_urls\s*=/.test(line)) {
          assert.equal(out[i], `additional_redirect_urls = ["https://127.0.0.1:${web}"]`);
        } else {
          assert.equal(out[i], line, `line ${ln} is identical`);
          return;
        }
        changed++;
      });
      assert.equal(changed, 8 + 3, 'exactly the 8 ports, project_id, site_url and redirect urls change');
      assert.ok(out.includes('# smtp_port = 54325'), 'commented smtp_port unchanged');
    }
  });

  test('EZD-172 L3 lanes differ', () => {
    const ids = new Set();
    const ports = [];
    for (const n of [0, 1, 2, 3]) {
      ids.add(lane.laneProjectId('ezdraft', n));
      const lp = lane.lanePorts(committed, n);
      assert.deepEqual(lp, expectedPorts(n), `stack ports of lane ${n}`);
      const app = lane.laneAppPorts(n);
      assert.deepEqual(app, { web: 3000 + 10 * n, perf: 3200 + 10 * n });
      ports.push(...Object.values(lp), app.web, app.perf);
    }
    assert.equal(ids.size, 4);
    assert.equal(lane.laneProjectId('ezdraft', 0), 'ezdraft');
    assert.equal(lane.laneProjectId('ezdraft', 2), 'ezdraft-lane2');
    assert.equal(ports.length, 40);
    assert.equal(new Set(ports).size, 40, 'all 40 port values are distinct');
    const scratch = new Set();
    for (const m of [0, 1, 2, 3]) for (let p = 25320; p <= 25329; p++) scratch.add(p + 100 * m);
    for (const p of ports) assert.ok(!scratch.has(p), `${p} is not a scratch port`);
  });

  test('EZD-172 L4 refusals', () => {
    assert.throws(() => lane.laneConfigToml(committed, 0), { code: 'lane_invalid' });
    assert.throws(() => lane.laneConfigToml(committed, 4), { code: 'lane_invalid' });
    const noId = committed
      .split('\n')
      .filter((l) => !/^\s*project_id\s*=/.test(l))
      .join('\n');
    assert.throws(() => lane.laneConfigToml(noId, 1), { code: 'lane_config_unexpected' });
    const noSite = committed
      .split('\n')
      .filter((l) => !/^site_url\s*=/.test(l))
      .join('\n');
    assert.throws(() => lane.laneConfigToml(noSite, 1), { code: 'lane_config_unexpected' });
  });

  test('EZD-172 L5 prepare', async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd172-prep-'));
    const tmp2 = mkdtempSync(path.join(os.tmpdir(), 'ezd172-prep0-'));
    const tmp3 = mkdtempSync(path.join(os.tmpdir(), 'ezd172-prep-noseed-'));
    try {
      const migs = readdirSync(path.join(repo, 'supabase', 'migrations'))
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .slice(0, 2);
      const tpls = readdirSync(path.join(repo, 'supabase', 'templates'));
      const build = (root, withSeed) => {
        mkdirSync(path.join(root, 'supabase', 'migrations'), { recursive: true });
        mkdirSync(path.join(root, 'supabase', 'templates'), { recursive: true });
        copyFileSync(path.join(repo, 'supabase', 'config.toml'), path.join(root, 'supabase', 'config.toml'));
        if (withSeed) copyFileSync(path.join(repo, 'supabase', 'seed.sql'), path.join(root, 'supabase', 'seed.sql'));
        for (const m of migs) {
          copyFileSync(path.join(repo, 'supabase', 'migrations', m), path.join(root, 'supabase', 'migrations', m));
        }
        for (const t of tpls) {
          copyFileSync(path.join(repo, 'supabase', 'templates', t), path.join(root, 'supabase', 'templates', t));
        }
      };
      build(tmp, true);
      const laneDir = path.join(tmp, '.lanes', 'lane2');
      mkdirSync(path.join(laneDir, 'supabase', 'migrations'), { recursive: true });
      mkdirSync(path.join(laneDir, 'supabase', '.temp'), { recursive: true });
      writeFileSync(path.join(laneDir, 'supabase', 'migrations', 'old.sql'), '-- old\n');
      writeFileSync(path.join(laneDir, 'supabase', '.temp', 'keep'), 'keep\n');

      const got = lane.prepareLaneWorkdir(tmp, 2);
      assert.equal(got, laneDir);
      const sup = path.join(laneDir, 'supabase');
      const srcConfig = readFileSync(path.join(tmp, 'supabase', 'config.toml'), 'utf8');
      assert.equal(readFileSync(path.join(sup, 'config.toml'), 'utf8'), lane.laneConfigToml(srcConfig, 2));
      assert.deepEqual(readdirSync(path.join(sup, 'migrations')).sort(), migs);
      for (const m of migs) {
        assert.deepEqual(
          readFileSync(path.join(sup, 'migrations', m)),
          readFileSync(path.join(tmp, 'supabase', 'migrations', m)),
        );
      }
      assert.ok(!existsSync(path.join(sup, 'migrations', 'old.sql')), 'old.sql removed');
      assert.deepEqual(readFileSync(path.join(sup, 'seed.sql')), readFileSync(path.join(tmp, 'supabase', 'seed.sql')));
      assert.deepEqual(readdirSync(path.join(sup, 'templates')).sort(), [...tpls].sort());
      for (const t of tpls) {
        assert.deepEqual(
          readFileSync(path.join(sup, 'templates', t)),
          readFileSync(path.join(tmp, 'supabase', 'templates', t)),
        );
      }
      assert.equal(readFileSync(path.join(sup, '.temp', 'keep'), 'utf8'), 'keep\n', '.temp/keep kept');

      const files = [
        path.join(sup, 'config.toml'),
        path.join(sup, 'seed.sql'),
        ...migs.map((m) => path.join(sup, 'migrations', m)),
        ...tpls.map((t) => path.join(sup, 'templates', t)),
      ];
      const before = files.map((f) => statSync(f).mtimeMs);
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(lane.prepareLaneWorkdir(tmp, 2), laneDir);
      assert.deepEqual(files.map((f) => statSync(f).mtimeMs), before, 'second call changes no mtime');

      build(tmp2, true);
      assert.equal(lane.prepareLaneWorkdir(tmp2, 0), null);
      assert.ok(!existsSync(path.join(tmp2, '.lanes')), 'lane 0 writes nothing');

      build(tmp3, false);
      assert.throws(() => lane.prepareLaneWorkdir(tmp3, 1), { code: 'lane_config_unexpected' });
      assert.ok(!existsSync(path.join(tmp3, '.lanes')), 'no .lanes after a refused prepare');
    } finally {
      for (const d of [tmp, tmp2, tmp3]) rmSync(d, { recursive: true, force: true });
    }
  });

  test('EZD-172 L6 checkLaneEnv', () => {
    const root = path.join(os.tmpdir(), 'ezd172-fake-repo');
    const w1 = path.join(root, '.lanes', 'lane1');
    const w2 = path.join(root, '.lanes', 'lane2');
    assert.deepEqual(lane.checkLaneEnv({}, root), { lane: 0, workdir: null });
    assert.throws(
      () => lane.checkLaneEnv({ EZD_LANE: '1' }, root),
      (e) => e.code === 'lane_env_mismatch' && e.message.includes(`SUPABASE_WORKDIR=${w1}`),
    );
    assert.deepEqual(lane.checkLaneEnv({ EZD_LANE: '1', SUPABASE_WORKDIR: w1 }, root), {
      lane: 1,
      workdir: w1,
    });
    assert.throws(() => lane.checkLaneEnv({ SUPABASE_WORKDIR: '/x' }, root), { code: 'lane_env_mismatch' });
    assert.throws(() => lane.checkLaneEnv({ EZD_LANE: '1', SUPABASE_WORKDIR: w2 }, root), {
      code: 'lane_env_mismatch',
    });
  });

  test('EZD-172 L7 local.mjs lane', () => {
    const run = (extra) =>
      spawnSync(process.execPath, [localScript, 'lane'], { cwd: repo, encoding: 'utf8', env: cleanEnv(extra) });
    const r0 = run({});
    assert.equal(r0.status, 0, r0.stderr);
    assert.deepEqual(JSON.parse(r0.stdout.trim()), {
      lane: 0,
      projectId: 'ezdraft',
      workdir: null,
      web: 3000,
      perf: 3200,
      ports: expectedPorts(0),
      env: {},
    });
    const r2 = run({ EZD_LANE: '2' });
    assert.equal(r2.status, 0, r2.stderr);
    const workdir = path.join(repo, '.lanes', 'lane2');
    assert.deepEqual(JSON.parse(r2.stdout.trim()), {
      lane: 2,
      projectId: 'ezdraft-lane2',
      workdir,
      web: 3020,
      perf: 3220,
      ports: expectedPorts(2),
      env: { EZD_LANE: '2', SUPABASE_WORKDIR: workdir },
    });
    const r9 = run({ EZD_LANE: '9' });
    assert.equal(r9.status, 1);
    assert.equal(r9.stdout, '');
    assert.ok(r9.stderr.includes('EZD_LANE must be 0, 1, 2 or 3'), r9.stderr);
  });

  test('EZD-172 L8 env and prepare refused without SUPABASE_WORKDIR', () => {
    for (const cmd of ['env', 'prepare']) {
      const r = spawnSync(process.execPath, [localScript, cmd], {
        cwd: repo,
        encoding: 'utf8',
        env: cleanEnv({ EZD_LANE: '1' }),
      });
      assert.equal(r.status, 1, `${cmd}: ${r.stdout}${r.stderr}`);
      assert.equal(r.stdout, '', `${cmd} stdout empty`);
      assert.ok(
        r.stderr.includes(`SUPABASE_WORKDIR=${path.join(repo, '.lanes', 'lane1')}`),
        `${cmd} stderr: ${r.stderr}`,
      );
    }
  });

  test('EZD-172 L9 SQL container', async () => {
    const { localDbContainer } = await import(url('scripts', 'db', 'sql.mjs'));
    assert.equal(localDbContainer({}), 'supabase_db_ezdraft');
    assert.equal(localDbContainer({ EZD_LANE: '3' }), 'supabase_db_ezdraft-lane3');
  });

  test('EZD-172 L10 perf port', async () => {
    const { serverPort, UsageError } = await import(url('scripts', 'perf', 'check.mjs'));
    assert.equal(serverPort({}), 3200);
    assert.equal(serverPort({ EZD_LANE: '1' }), 3210);
    assert.throws(() => serverPort({ EZD_LANE: 'x' }), UsageError);
  });

  test('EZD-172 L11 scratch lane', async () => {
    const scratch = await import(url('scripts', 'backup', 'scratch.mjs'));
    assert.equal(scratch.scratchDbContainer(0), 'supabase_db_ezdraft-restore');
    assert.equal(scratch.scratchDbContainer(2), 'supabase_db_ezdraft-restore-lane2');
    const newest = readdirSync(path.join(repo, 'supabase', 'migrations'))
      .filter((f) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f))
      .sort()
      .pop()
      .slice(0, 14);
    const dirs = [];
    try {
      const w2 = await scratch.prepareWorkdir({ newestMigration: newest, lane: 2 });
      dirs.push(w2);
      const cfg2 = readFileSync(path.join(w2, 'supabase', 'config.toml'), 'utf8');
      assert.match(cfg2, /^project_id = "ezdraft-restore-lane2"$/m);
      assert.match(cfg2, /^port = 25521$/m);
      assert.match(cfg2, /^port = 25522$/m);
      assert.match(cfg2, /^shadow_port = 25520$/m);
      assert.match(cfg2, /^port = 25529$/m);
      const w0 = await scratch.prepareWorkdir({ newestMigration: newest, lane: 0 });
      dirs.push(w0);
      assert.equal(
        readFileSync(path.join(w0, 'supabase', 'config.toml'), 'utf8'),
        read('scripts', 'backup', 'scratch', 'supabase', 'config.toml'),
      );
    } finally {
      for (const d of dirs) rmSync(d, { recursive: true, force: true });
    }
  });

  describe('EZD-172 L12 gate lanes', { timeout: 300000 }, () => {
    let fixture;
    let tmp;
    const probeFile = () => path.join(tmp, 'probe-out.json');

    // EZD-344: the gate gives its children an exact environment, so the fixture children find their files under os.tmpdir() (TMPDIR is tmp)
    // and the fake stop's knobs through fake-knobs.json in tmp, not through variables.
    const KNOB_KEYS = ['FAKE_STOP_NOISE', 'FAKE_STOP_SIGNAL', 'FAKE_STOP_LANE', 'FAKE_STOP_EXIT'];
    const withKnobs = (extra) => {
      const knobs = Object.fromEntries(Object.entries(extra).filter(([k]) => KNOB_KEYS.includes(k)));
      const file = path.join(tmp, 'fake-knobs.json');
      if (Object.keys(knobs).length) writeFileSync(file, JSON.stringify(knobs));
      else rmSync(file, { force: true });
      return Object.fromEntries(Object.entries(extra).filter(([k]) => !KNOB_KEYS.includes(k)));
    };

    const runGate = (extra = {}) => {
      const r = spawnSync(process.execPath, [path.join(repo, 'scripts', 'gate.mjs'), fixture], {
        encoding: 'utf8',
        env: cleanEnv({ TMP: tmp, TEMP: tmp, TMPDIR: tmp, ...withKnobs(extra) }),
        maxBuffer: 64 * 1024 * 1024,
      });
      return { status: r.status, out: r.stdout || '', err: r.stderr || '', all: (r.stdout || '') + (r.stderr || '') };
    };

    const stopFile = () => path.join(tmp, 'stop-out.txt');
    const stopLines = () => readFileSync(stopFile(), 'utf8').split('\n').filter(Boolean);
    const FAKE_LOCAL = [
      "import { appendFileSync, existsSync, readFileSync } from 'node:fs';",
      "import os from 'node:os';",
      "import path from 'node:path';",
      "const probeFile = path.join(os.tmpdir(), 'probe-out.json');",
      "const knobsFile = path.join(os.tmpdir(), 'fake-knobs.json');",
      "const knobs = existsSync(knobsFile) ? JSON.parse(readFileSync(knobsFile, 'utf8')) : {};",
      'const probe = existsSync(probeFile) ? "yes" : "no";',
      "appendFileSync(path.join(os.tmpdir(), 'stop-out.txt'), `${process.argv[2]} ${process.env.EZD_LANE} ${process.env.SUPABASE_WORKDIR} probe=${probe}\\n`);",
      "for (let i = 0; i < Number(knobs.FAKE_STOP_NOISE || 0); i += 1) console.log(`noise ${i}`);",
      "if (knobs.FAKE_STOP_SIGNAL) process.kill(process.pid, knobs.FAKE_STOP_SIGNAL);",
      'const only = knobs.FAKE_STOP_LANE;',
      "process.exit(!only || only === process.env.EZD_LANE ? Number(knobs.FAKE_STOP_EXIT || 0) : 0);",
      '',
    ].join('\n');

    const setup = ({ failTest = false, noisyTest = false, fake = true, nodeModules = true, lockfile = false } = {}) => {
      fixture = mkdtempSync(path.join(os.tmpdir(), 'ezd172-gate-fixture-'));
      tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd172-gate-tmp-'));
      const ok = 'node -e "process.exit(0)"';
      const probeBase =
        'require(\'node:fs\').writeFileSync(require(\'node:path\').join(require(\'node:os\').tmpdir(), \'probe-out.json\'), JSON.stringify([process.env.EZD_LANE || \'\', process.env.SUPABASE_WORKDIR || \'\']))';
      const noise = noisyTest ? '; for (let i = 0; i < 120; i += 1) console.log(\'not ok \' + i + \' - x\'); process.exit(1)' : '';
      const probe = `node -e "${probeBase}${failTest ? '; process.exit(1)' : ''}${noise}"`;
      if (fake) {
        mkdirSync(path.join(fixture, 'scripts', 'db'), { recursive: true });
        writeFileSync(path.join(fixture, 'scripts', 'db', 'local.mjs'), FAKE_LOCAL);
      }
      writeFileSync(
        path.join(fixture, 'package.json'),
        JSON.stringify(
          {
            name: 'ezd172-fixture',
            version: '0.0.0',
            private: true,
            scripts: { typecheck: ok, lint: ok, test: probe, build: ok },
          },
          null,
          2,
        ),
      );
      if (nodeModules) mkdirSync(path.join(fixture, 'node_modules'));
      if (lockfile) {
        writeFileSync(
          path.join(fixture, 'package-lock.json'),
          '{"name":"ezd172-fixture","version":"0.0.0","lockfileVersion":3,"requires":true,"packages":{"":{"name":"ezd172-fixture","version":"0.0.0"}}}',
        );
      }
    };
    const teardown = () => {
      rmSync(fixture, { recursive: true, force: true });
      rmSync(tmp, { recursive: true, force: true });
    };

    test('EZD-172 L12 (a) an invalid lane fails before anything runs', () => {
      setup();
      try {
        const r = runGate({ EZD_LANE: '7' });
        assert.equal(r.status, 1, r.all);
        assert.ok(r.all.includes('GATE FAIL: EZD_LANE must be 0, 1, 2 or 3 (got "7").'), r.all);
      } finally {
        teardown();
      }
    });

    test('EZD-172 L12 (b) a held lane 1 lock stops lane 1 only', () => {
      setup();
      try {
        const lock = path.join(tmp, 'ezdraft-gate-lane1.lock');
        writeFileSync(lock, String(process.pid));
        const held = runGate({ EZD_LANE: '1' });
        assert.equal(held.status, 1, held.all);
        assert.ok(held.all.includes('another gate is running on lane 1'), held.all);
        const other = runGate({ EZD_LANE: '2' });
        assert.equal(other.status, 0, other.all);
        assert.ok(other.all.includes('GATE PASS'), other.all);
      } finally {
        teardown();
      }
    });

    test('EZD-172 L12 (c) a held lane 0 lock stops lane 0 only', () => {
      setup();
      try {
        const lock = path.join(tmp, 'ezdraft-gate.lock');
        writeFileSync(lock, String(process.pid));
        const held = runGate();
        assert.equal(held.status, 1, held.all);
        assert.ok(held.all.includes('Run one gate at a time (Q-0019)'), held.all);
        const other = runGate({ EZD_LANE: '1' });
        assert.equal(other.status, 0, other.all);
        assert.ok(other.all.includes('GATE PASS'), other.all);
      } finally {
        teardown();
      }
    });

    test('EZD-172 L12 (d) the checks see the lane env; lane 0 clears SUPABASE_WORKDIR', () => {
      setup();
      try {
        const r2 = runGate({ EZD_LANE: '2' });
        assert.equal(r2.status, 0, r2.all);
        assert.deepEqual(JSON.parse(readFileSync(probeFile(), 'utf8')), [
          '2',
          path.join(fixture, '.lanes', 'lane2'),
        ]);
        assert.match(r2.out, /^GATE: .* · scope: .* · lane 2$/m);
        rmSync(probeFile());
        const r0 = runGate({ SUPABASE_WORKDIR: '/bogus' });
        assert.equal(r0.status, 0, r0.all);
        assert.deepEqual(JSON.parse(readFileSync(probeFile(), 'utf8')), ['', '']);
        const header = r0.out.split('\n').find((l) => l.startsWith('GATE: '));
        assert.ok(header && !header.includes(' · lane'), header);
      } finally {
        teardown();
      }
    });

    test('EZD-172 L12 (e) a lane gate stops its lane stack after the checks', () => {
      setup();
      try {
        const r = runGate({ EZD_LANE: '2' });
        assert.equal(r.status, 0, r.all);
        assert.ok(r.all.includes('GATE PASS'), r.all);
        assert.equal(stopLines().at(-1), `stop-lane 2 ${path.join(fixture, '.lanes', 'lane2')} probe=yes`);
        assert.ok(r.all.includes('=== lane stop: node scripts/db/local.mjs stop-lane ==='), r.all);
        assert.match(r.all, /^lane stop\s+pass$/m);
      } finally {
        teardown();
      }
    });

    test('EZD-172 L12 (f) lane 0 stops nothing', () => {
      setup();
      try {
        const r = runGate();
        assert.equal(r.status, 0, r.all);
        assert.equal(existsSync(stopFile()), false, 'no stop call');
        assert.ok(!r.all.includes('lane stop'), r.all);
      } finally {
        teardown();
      }
    });

    test('EZD-172 L12 (g) a gate refused by the lane lock does not stop the stack', () => {
      setup();
      try {
        writeFileSync(path.join(tmp, 'ezdraft-gate-lane1.lock'), String(process.pid));
        const r = runGate({ EZD_LANE: '1' });
        assert.equal(r.status, 1, r.all);
        assert.ok(r.all.includes('another gate is running on lane 1'), r.all);
        assert.equal(existsSync(stopFile()), false, 'no stop call');
      } finally {
        teardown();
      }
    });

    test('EZD-172 L12 (h) a failed check still stops the lane stack', () => {
      setup({ failTest: true });
      try {
        const r = runGate({ EZD_LANE: '1' });
        assert.equal(r.status, 1, r.all);
        assert.ok(r.all.includes('GATE FAIL: test'), r.all);
        assert.ok(stopLines().includes(`stop-lane 1 ${path.join(fixture, '.lanes', 'lane1')} probe=yes`), r.all);
      } finally {
        teardown();
      }
    });

    test('EZD-172 L12 (i) a failed stop fails the gate', () => {
      setup();
      try {
        const r = runGate({ EZD_LANE: '1', FAKE_STOP_EXIT: '1', FAKE_STOP_LANE: '1' });
        assert.equal(r.status, 1, r.all);
        assert.match(r.all, /^lane stop\s+FAIL$/m);
        assert.ok(r.all.includes('GATE FAIL: lane stop'), r.all);
      } finally {
        teardown();
      }
    });

    test('EZD-172 L12 (i) a failed stop reaches gate-failures.log, six lines at most', () => {
      setup();
      try {
        const r = runGate({ EZD_LANE: '1', FAKE_STOP_EXIT: '1', FAKE_STOP_LANE: '1', FAKE_STOP_NOISE: '30' });
        assert.equal(r.status, 1, r.all);
        const lines = readFileSync(path.join(fixture, 'gate-failures.log'), 'utf8').split('\n').filter(Boolean);
        assert.equal(lines[0], '=== lane stop ===');
        assert.equal(lines[1], 'exit 1');
        assert.equal(lines[2], 'noise 0');
        assert.equal(lines.length, 6);
      } finally {
        teardown();
      }
    });

    test('EZD-172 L12 (i) a stop killed by a signal names the signal in gate-failures.log', () => {
      setup();
      try {
        const r = runGate({ EZD_LANE: '1', FAKE_STOP_SIGNAL: 'SIGTERM' });
        assert.equal(r.status, 1, r.all);
        const lines = readFileSync(path.join(fixture, 'gate-failures.log'), 'utf8').split('\n').filter(Boolean);
        assert.ok(lines.includes('=== lane stop ==='), lines.join('\n'));
        assert.equal(lines[lines.indexOf('=== lane stop ===') + 1], 'signal SIGTERM');
      } finally {
        teardown();
      }
    });

    test('EZD-172 L12 (i) a failed stop stays inside the gate-failures.log cap of 100 lines', () => {
      setup({ noisyTest: true });
      try {
        const r = runGate({ EZD_LANE: '1', FAKE_STOP_EXIT: '1', FAKE_STOP_LANE: '1' });
        assert.equal(r.status, 1, r.all);
        const failures = readFileSync(path.join(fixture, 'gate-failures.log'), 'utf8');
        assert.equal(failures.split('\n').filter(Boolean).length, 100);
        assert.ok(!failures.includes('=== lane stop ==='), 'no room left for the entry');
      } finally {
        teardown();
      }
    });

    test('EZD-172 L12 (j) a missing local.mjs fails the lane stop', () => {
      setup({ fake: false });
      try {
        const r = runGate({ EZD_LANE: '3' });
        assert.equal(r.status, 1, r.all);
        assert.ok(r.all.includes('lane sweep: scripts/db/local.mjs is missing'), r.all);
        assert.ok(r.all.includes('lane stop: scripts/db/local.mjs is missing'), r.all);
        assert.ok(r.all.includes('GATE FAIL: lane sweep, lane stop'), r.all);
        const failures = readFileSync(path.join(fixture, 'gate-failures.log'), 'utf8');
        assert.ok(failures.includes('=== lane sweep ===\nscripts/db/local.mjs is missing'), failures);
        assert.ok(failures.includes('=== lane stop ===\nscripts/db/local.mjs is missing'), failures);
      } finally {
        teardown();
      }
    });

    test('EZD-172 L12 (k) a failed install still stops the lane stack', () => {
      setup({ nodeModules: false });
      try {
        const r = runGate({ EZD_LANE: '2' });
        assert.equal(r.status, 1, r.all);
        assert.ok(r.all.includes('GATE FAIL: install'), r.all);
        assert.deepEqual(stopLines(), [`stop-lane 2 ${path.join(fixture, '.lanes', 'lane2')} probe=no`]);
        assert.match(r.all, /^lane stop\s+pass$/m);
      } finally {
        teardown();
      }
    });

    // ---- L18 (round 6, Q-0367 (b)): a lane gate stops stale stacks of the other lanes first.
    const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid;
    const lanePath = (n) => path.join(fixture, '.lanes', `lane${n}`);
    const stop = (n, probe) => `stop-lane ${n} ${lanePath(n)} probe=${probe}`;
    const sweepLocksLeft = () => readdirSync(tmp).filter((f) => /^ezdraft-sweep-lane.*\.lock$/.test(f));

    test('EZD-172 L18 (a) a lane gate sweeps the other lanes, then runs, then stops its own', () => {
      setup();
      try {
        const r = runGate({ EZD_LANE: '2' });
        assert.equal(r.status, 0, r.all);
        assert.ok(r.all.includes('GATE PASS'), r.all);
        assert.deepEqual(stopLines(), [stop(1, 'no'), stop(3, 'no'), stop(2, 'yes')]);
        assert.ok(r.all.includes('=== lane sweep: stale stacks of the other lanes ==='), r.all);
        assert.ok(r.all.includes('lane sweep: lane 1 pass'), r.all);
        assert.ok(r.all.includes('lane sweep: lane 3 pass'), r.all);
        const sweepAt = r.all.search(/^lane sweep pass$/m);
        const stopAt = r.all.search(/^lane stop\s+pass$/m);
        assert.ok(sweepAt >= 0 && stopAt > sweepAt, r.all);
        assert.deepEqual(sweepLocksLeft(), []);
      } finally {
        teardown();
      }
    });

    test('EZD-172 L18 (b) a live gate lock or lease protects that lane', () => {
      setup();
      try {
        const gateLock = path.join(tmp, 'ezdraft-gate-lane1.lock');
        const lease = path.join(tmp, 'ezdraft-lane3.lease');
        writeFileSync(gateLock, String(process.pid));
        writeFileSync(lease, String(process.pid));
        const r = runGate({ EZD_LANE: '2' });
        assert.equal(r.status, 0, r.all);
        assert.ok(r.all.includes('GATE PASS'), r.all);
        assert.deepEqual(stopLines(), [stop(2, 'yes')]);
        assert.ok(r.all.includes(`lane sweep: lane 1 skipped (gate pid ${process.pid})`), r.all);
        assert.ok(r.all.includes(`lane sweep: lane 3 skipped (lease pid ${process.pid})`), r.all);
        assert.equal(readFileSync(gateLock, 'utf8'), String(process.pid));
        assert.equal(readFileSync(lease, 'utf8'), String(process.pid));
      } finally {
        teardown();
      }
    });

    test('EZD-172 L18 (c) a dead gate lock or lease does not protect, and is left as it is', () => {
      setup();
      try {
        const dead = String(deadPid());
        const gateLock = path.join(tmp, 'ezdraft-gate-lane2.lock');
        const lease = path.join(tmp, 'ezdraft-lane3.lease');
        writeFileSync(gateLock, dead);
        writeFileSync(lease, dead);
        const r = runGate({ EZD_LANE: '1' });
        assert.equal(r.status, 0, r.all);
        assert.ok(r.all.includes('GATE PASS'), r.all);
        assert.deepEqual(stopLines(), [stop(2, 'no'), stop(3, 'no'), stop(1, 'yes')]);
        assert.equal(readFileSync(gateLock, 'utf8'), dead);
        assert.equal(readFileSync(lease, 'utf8'), dead);
      } finally {
        teardown();
      }
    });

    test('EZD-172 L18 (d) a failed sweep of another lane fails the gate but the checks and own stop still run', () => {
      setup();
      try {
        const r = runGate({ EZD_LANE: '1', FAKE_STOP_EXIT: '1', FAKE_STOP_LANE: '3' });
        assert.equal(r.status, 1, r.all);
        assert.ok(r.all.includes('lane sweep: lane 2 pass'), r.all);
        assert.ok(r.all.includes('lane sweep: lane 3 FAIL'), r.all);
        assert.match(r.all, /^lane sweep FAIL$/m);
        assert.match(r.all, /^lane stop\s+pass$/m);
        assert.ok(r.all.includes('GATE FAIL: lane sweep'), r.all);
        assert.ok(readFileSync(path.join(fixture, 'gate-failures.log'), 'utf8').includes('=== lane sweep lane 3 ==='), 'the sweep failure reaches gate-failures.log');
        assert.equal(existsSync(probeFile()), true, 'the checks ran');
      } finally {
        teardown();
      }
    });

    test('EZD-172 L18 (e) a live sweep lock of another lane is skipped', () => {
      setup();
      try {
        writeFileSync(path.join(tmp, 'ezdraft-sweep-lane1.lock'), String(process.pid));
        const r = runGate({ EZD_LANE: '2' });
        assert.equal(r.status, 0, r.all);
        assert.ok(r.all.includes('GATE PASS'), r.all);
        assert.ok(r.all.includes(`lane sweep: lane 1 skipped (sweep pid ${process.pid})`), r.all);
        assert.ok(!stopLines().some((l) => l.startsWith('stop-lane 1 ')), stopLines().join('\n'));
      } finally {
        teardown();
      }
    });

    test('EZD-172 L18 (f) a gate waits while another gate sweeps its lane', () => {
      setup();
      try {
        // An orphan that init reaps: the pid is dead after 2 s and is never a child of this process.
        const orphan = spawnSync('sh', ['-c', 'sleep 2 >/dev/null 2>&1 & echo $!'], { encoding: 'utf8' }).stdout.trim();
        writeFileSync(path.join(tmp, 'ezdraft-sweep-lane1.lock'), orphan);
        const t0 = Date.now();
        const r = runGate({ EZD_LANE: '1' });
        const ms = Date.now() - t0;
        assert.equal(r.status, 0, r.all);
        assert.ok(r.all.includes('GATE PASS'), r.all);
        assert.equal(stopLines()[0], stop(2, 'no'));
        assert.ok(ms >= 1500, `the gate ran ${ms} ms`);
      } finally {
        teardown();
      }
    });

    test('EZD-172 L18 (g) lane 0 never sweeps', () => {
      setup();
      try {
        const r = runGate();
        assert.equal(r.status, 0, r.all);
        assert.ok(!r.all.includes('lane sweep'), r.all);
        assert.equal(existsSync(stopFile()), false, 'no stop call');
      } finally {
        teardown();
      }
    });

    test('EZD-172 L18 (h) pids are read strictly; foreign lock and lease text is left alone', () => {
      setup();
      try {
        const deadSweep = path.join(tmp, 'ezdraft-sweep-lane3.lock');
        const gateLock = path.join(tmp, 'ezdraft-gate-lane2.lock');
        const lease = path.join(tmp, 'ezdraft-lane2.lease');
        writeFileSync(deadSweep, String(deadPid()));
        writeFileSync(gateLock, 'x');
        writeFileSync(lease, '-5');
        const r = runGate({ EZD_LANE: '1' });
        assert.equal(r.status, 0, r.all);
        assert.ok(r.all.includes('GATE PASS'), r.all);
        assert.deepEqual(stopLines(), [stop(2, 'no'), stop(3, 'no'), stop(1, 'yes')]);
        assert.equal(existsSync(deadSweep), false, 'the dead sweep lock is gone');
        assert.equal(readFileSync(gateLock, 'utf8'), 'x');
        assert.equal(readFileSync(lease, 'utf8'), '-5');
      } finally {
        teardown();
      }
    });

    test('EZD-172 L18 (i) the sweep runs after the install', () => {
      setup({ nodeModules: false, lockfile: true });
      try {
        const r = runGate({ EZD_LANE: '2' });
        assert.equal(r.status, 0, r.all);
        assert.ok(r.all.includes('GATE PASS'), r.all);
        const installAt = r.all.indexOf('=== install: npm ci ===');
        const sweepAt = r.all.indexOf('=== lane sweep: stale stacks of the other lanes ===');
        assert.ok(installAt >= 0 && sweepAt > installAt, r.all);
        assert.equal(stopLines().length, 3, stopLines().join('\n'));
      } finally {
        teardown();
      }
    });

    // ---- L22 (round 7, Q-0381 (a)): a visible lock is never treated as empty.
    const tmpLeft = () => readdirSync(tmp).filter((f) => f.endsWith('.tmp'));

    test('EZD-172 L22 (a) an empty lock held by a live gate is not deleted', async () => {
      setup();
      try {
        const lock = path.join(tmp, 'ezdraft-gate.lock');
        writeFileSync(lock, '');
        const child = spawn(process.execPath, [path.join(repo, 'scripts', 'gate.mjs'), fixture], {
          env: cleanEnv({ TMP: tmp, TEMP: tmp, TMPDIR: tmp, ...withKnobs({}) }),
        });
        let out = '';
        let err = '';
        child.stdout.on('data', (d) => (out += d));
        child.stderr.on('data', (d) => (err += d));
        let exited = false;
        const closed = new Promise((resolve) =>
          child.on('close', (code) => {
            exited = true;
            resolve(code);
          }),
        );
        const tmpLock = `${lock}.${child.pid}.tmp`;
        const deadline = Date.now() + 10000;
        let found = false;
        while (Date.now() < deadline && !exited) {
          if (existsSync(tmpLock)) {
            found = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 10));
        }
        if (found) writeFileSync(lock, String(process.pid));
        const code = await closed;
        assert.equal(found, true, `the gate never made ${tmpLock}\n${out}${err}`);
        assert.equal(code, 1, out + err);
        assert.ok(
          err.includes(`GATE FAIL: another gate is running (pid ${process.pid}). Run one gate at a time (Q-0019).`),
          out + err,
        );
        assert.equal(readFileSync(lock, 'utf8'), String(process.pid));
        assert.equal(existsSync(probeFile()), false, 'no checks ran');
        assert.deepEqual(tmpLeft(), []);
      } finally {
        teardown();
      }
    });

    test('EZD-172 L22 (b) an empty lane gate lock is waited on, then treated as dead', () => {
      setup();
      try {
        writeFileSync(path.join(tmp, 'ezdraft-gate-lane1.lock'), '');
        const before = Date.now();
        const r = runGate({ EZD_LANE: '1' });
        const elapsed = Date.now() - before;
        assert.equal(r.status, 0, r.all);
        assert.ok(r.all.includes('GATE PASS'), r.all);
        assert.ok(elapsed >= 2000, `waited ${elapsed} ms`);
        assert.equal(existsSync(path.join(tmp, 'ezdraft-gate-lane1.lock')), false);
        assert.deepEqual(tmpLeft(), []);
      } finally {
        teardown();
      }
    });

    test('EZD-172 L22 (c) an empty sweep lock counts as dead', () => {
      setup();
      try {
        writeFileSync(path.join(tmp, 'ezdraft-sweep-lane1.lock'), '');
        const r = runGate({ EZD_LANE: '2' });
        assert.equal(r.status, 0, r.all);
        assert.ok(r.all.includes('GATE PASS'), r.all);
        assert.ok(r.all.includes('lane sweep: lane 1 pass'), r.all);
        assert.ok(stopLines().includes(stop(1, 'no')), stopLines().join('\n'));
        assert.equal(existsSync(path.join(tmp, 'ezdraft-sweep-lane1.lock')), false);
        assert.deepEqual(tmpLeft(), []);
      } finally {
        teardown();
      }
    });

    // ---- L23 (round 8, Q-0408 (a)): a file at the temp name is never written through.
    // The gate runs under a shell that waits for a line on stdin, so its pid is known before it starts.
    async function runGateAfterPlanting(extraEnv, plant) {
      const child = spawn(
        '/bin/sh',
        ['-c', 'read line; exec "$@"', 'sh', process.execPath, path.join(repo, 'scripts', 'gate.mjs'), fixture],
        {
          env: cleanEnv({ TMP: tmp, TEMP: tmp, TMPDIR: tmp, ...withKnobs(extraEnv) }),
        },
      );
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      const closed = new Promise((resolve) => child.on('close', (code) => resolve(code)));
      try {
        plant(child.pid);
      } finally {
        child.stdin.end('go\n');
      }
      const code = await closed;
      return { code, out, err, all: out + err };
    }

    test('EZD-172 L23 (a) a symlink at the gate lock temp name is replaced, not followed', async () => {
      setup();
      try {
        const victim = path.join(tmp, 'victim');
        writeFileSync(victim, 'victim');
        const r = await runGateAfterPlanting({}, (pid) =>
          symlinkSync(victim, path.join(tmp, `ezdraft-gate.lock.${pid}.tmp`)),
        );
        assert.equal(r.code, 0, r.all);
        assert.ok(r.all.includes('GATE PASS'), r.all);
        assert.equal(readFileSync(victim, 'utf8'), 'victim');
        assert.equal(existsSync(path.join(tmp, 'ezdraft-gate.lock')), false);
        assert.deepEqual(tmpLeft(), []);
      } finally {
        teardown();
      }
    });

    test('EZD-172 L23 (b) a temp name hard-linked to a live gate lock does not change the lock', async () => {
      setup();
      try {
        const lock = path.join(tmp, 'ezdraft-gate.lock');
        writeFileSync(lock, String(process.pid));
        const r = await runGateAfterPlanting({}, (pid) => linkSync(lock, `${lock}.${pid}.tmp`));
        assert.equal(r.code, 1, r.all);
        assert.ok(
          r.err.includes(`GATE FAIL: another gate is running (pid ${process.pid}). Run one gate at a time (Q-0019).`),
          r.all,
        );
        assert.equal(readFileSync(lock, 'utf8'), String(process.pid));
        assert.equal(existsSync(probeFile()), false, 'no checks ran');
        assert.deepEqual(tmpLeft(), []);
      } finally {
        teardown();
      }
    });

    test('EZD-172 L23 (c) the sweep lock temp name is replaced, and a hard-linked sweep lock keeps its pid', async () => {
      setup();
      try {
        const victim = path.join(tmp, 'victim');
        writeFileSync(victim, 'victim');
        const lock3 = path.join(tmp, 'ezdraft-sweep-lane3.lock');
        writeFileSync(lock3, String(process.pid));
        const r = await runGateAfterPlanting({ EZD_LANE: '2' }, (pid) => {
          symlinkSync(victim, path.join(tmp, `ezdraft-sweep-lane1.lock.${pid}.tmp`));
          linkSync(lock3, `${lock3}.${pid}.tmp`);
        });
        assert.equal(r.code, 0, r.all);
        assert.ok(r.all.includes('GATE PASS'), r.all);
        assert.ok(r.all.includes('lane sweep: lane 1 pass'), r.all);
        assert.ok(r.all.includes(`lane sweep: lane 3 skipped (sweep pid ${process.pid})`), r.all);
        assert.ok(stopLines().includes(stop(1, 'no')), stopLines().join('\n'));
        assert.ok(!stopLines().some((l) => l.startsWith('stop-lane 3 ')), stopLines().join('\n'));
        assert.equal(readFileSync(victim, 'utf8'), 'victim');
        assert.equal(readFileSync(lock3, 'utf8'), String(process.pid));
        assert.equal(existsSync(path.join(tmp, 'ezdraft-sweep-lane1.lock')), false);
        assert.deepEqual(tmpLeft(), []);
      } finally {
        teardown();
      }
    });
  });

  test('EZD-172 L17 container per lane', async () => {
    assert.equal(lane.stackContainer('rest', 'ezdraft', 0), 'supabase_rest_ezdraft');
    assert.equal(lane.stackContainer('rest', 'ezdraft', 3), 'supabase_rest_ezdraft-lane3');
    assert.equal(lane.stackContainer('db', 'ezdraft-restore', 2), 'supabase_db_ezdraft-restore-lane2');
    const { postgrestContainer, restartPostgrest } = await import(url('scripts', 'db', 'api-gate-ready.mjs'));
    assert.equal(postgrestContainer({}), 'supabase_rest_ezdraft');
    assert.equal(postgrestContainer({ EZD_LANE: '2' }), 'supabase_rest_ezdraft-lane2');
    assert.throws(() => postgrestContainer({ EZD_LANE: '9' }), { code: 'lane_invalid' });
    const calls = [];
    await restartPostgrest({
      run: async (args) => {
        calls.push(args);
        return { code: 0 };
      },
      env: { EZD_LANE: '3' },
    });
    assert.deepEqual(calls, [['restart', 'supabase_rest_ezdraft-lane3']]);
  });

  test('EZD-172 L19 one container name form', () => {
    const files = [];
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === '__tests__' || e.name === 'node_modules') continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.mjs')) files.push(full);
      }
    };
    walk(path.join(repo, 'scripts'));
    const hits = files
      .filter((f) => /`supabase_[^`]*\$\{/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(repo, f).split(path.sep).join('/'))
      .sort();
    assert.deepEqual(hits, ['scripts/db/lane.mjs']);
    const body = (file, name) => {
      const text = read(...file.split('/'));
      const start = text.indexOf(`export function ${name}(`);
      assert.ok(start >= 0, `${name} in ${file}`);
      const end = text.indexOf('\n}', start);
      return text.slice(start, end < 0 ? undefined : end);
    };
    for (const [file, name] of [
      ['scripts/db/sql.mjs', 'localDbContainer'],
      ['scripts/db/api-gate-ready.mjs', 'postgrestContainer'],
      ['scripts/backup/scratch.mjs', 'scratchDbContainer'],
    ]) {
      assert.ok(body(file, name).includes('stackContainer('), `${name} uses stackContainer(`);
    }
  });

  const withoutLineComments = (text) =>
    text
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');

  test('EZD-172 L20 gate spawners drop the lane env', () => {
    const skip = new Set(['node_modules', '.next', '.lanes']);
    const files = [];
    const walk = (dir, inTests) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(e.name)) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, inTests || e.name === '__tests__');
        else if (inTests || /\.(test\.mjs|test\.ts|spec\.ts)$/.test(e.name)) files.push(full);
      }
    };
    walk(path.join(repo, 'scripts'), false);
    walk(path.join(repo, 'app'), false);
    const spawners = files
      .filter((f) => readFileSync(f, 'utf8').split('\n').some((l) => /path\.(join|resolve)\(.*'gate\.mjs'/.test(l)))
      .map((f) => path.relative(repo, f).split(path.sep).join('/'))
      .sort();
    for (const f of [
      'scripts/ci/__tests__/ci.test.mjs',
      'scripts/ci/__tests__/gate-failures.test.mjs',
      'scripts/db/__tests__/lane.test.mjs',
      'scripts/tooling/__tests__/tooling.test.mjs',
    ]) {
      assert.ok(spawners.includes(f), `${f} is found as a gate spawner`);
    }
    for (const f of spawners) {
      const text = withoutLineComments(read(...f.split('/')));
      assert.ok(text.includes('EZD_LANE'), `${f} names EZD_LANE outside comments`);
      assert.ok(text.includes('SUPABASE_WORKDIR'), `${f} names SUPABASE_WORKDIR outside comments`);
    }
  });

  test('EZD-172 L21 no lane-0 server address in browser code', () => {
    const files = [path.join(repo, 'app', 'playwright.config.ts')];
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else files.push(full);
      }
    };
    walk(path.join(repo, 'app', 'e2e'));
    walk(path.join(repo, 'app', 'test-harness', 'e2e'));
    const banned = [/127\.0\.0\.1:3000/, /localhost:3000/, /127\.0\.0\.1:3200/, /localhost:3200/, /:5432\d\b/];
    const allowed = [
      { file: 'app/test-harness/e2e/session-claims.ts', line: "const ORIGIN = 'http://127.0.0.1:3000';" },
      // Email link text from appOrigin's fixed local value, the same in every lane; not a server address.
      { file: 'app/e2e/notifications.spec.ts', line: "expect(linksIn(mine()[0]).text).toContain('http://localhost:3000/');" },
    ];
    const bad = [];
    for (const f of files) {
      const rel = path.relative(repo, f).split(path.sep).join('/');
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((l, i) => {
          if (l.trim().startsWith('//')) return;
          if (allowed.some((a) => rel === a.file && l.trim() === a.line)) return;
          if (banned.some((re) => re.test(l))) bad.push(`${rel}:${i + 1}: ${l.trim()}`);
        });
    }
    assert.deepEqual(bad, []);
  });
});

describe('EZD-172 L13-L15 restart marker and up()', () => {
  test('EZD-172 L13 restart marker per lane', async () => {
    const { laneSuffixed } = lane;
    const { STACK_CONFIG_MARKER, ensureStackCurrent, stackConfigHash } = await import(
      url('scripts', 'db', 'stack-config.mjs')
    );
    assert.equal(laneSuffixed('x', 0), 'x');
    assert.equal(laneSuffixed('x', 3), 'x-lane3');

    const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd-172-l13-'));
    try {
      const shared = path.join(tmp, 'shared');
      mkdirSync(shared, { recursive: true });
      const mkRoot = (name) => {
        const root = path.join(tmp, name);
        mkdirSync(path.join(root, 'supabase', 'templates'), { recursive: true });
        writeFileSync(path.join(root, 'supabase', 'config.toml'), 'project_id = "fixture"\n');
        writeFileSync(path.join(root, 'supabase', 'templates', 'a.html'), '<p>a</p>\n');
        return root;
      };
      const r0 = mkRoot('r0');
      const r1 = mkRoot('r1');
      const m0 = path.join(shared, laneSuffixed(STACK_CONFIG_MARKER, 0));
      const m1 = path.join(shared, laneSuffixed(STACK_CONFIG_MARKER, 1));
      assert.equal(path.basename(m0), 'ezd-stack-config-sha256');
      assert.equal(path.basename(m1), 'ezd-stack-config-sha256-lane1');
      writeFileSync(m0, `${stackConfigHash(r0)}\n`);
      writeFileSync(m1, `${stackConfigHash(r1)}\n`);
      const old0 = readFileSync(m0, 'utf8');
      for (const r of [r0, r1]) {
        writeFileSync(path.join(r, 'supabase', 'config.toml'), 'project_id = "fixture"\n# changed\n');
      }
      const OK = { ok: true, status: 0, out: '', stdout: '', stderr: '' };
      const fakeCli = () => {
        const calls = [];
        const fn = (args) => {
          calls.push(args);
          return OK;
        };
        fn.calls = calls;
        return fn;
      };

      const cli1 = fakeCli();
      assert.deepEqual(ensureStackCurrent({ cli: cli1, root: r1, markerFile: m1, checkTemplates: () => ({ ok: true }) }), { outcome: 'restarted' });
      assert.deepEqual(cli1.calls, [['status'], ['stop'], ['start']]);
      assert.equal(readFileSync(m1, 'utf8'), `${stackConfigHash(r1)}\n`);
      assert.equal(readFileSync(m0, 'utf8'), old0, 'lane 0 marker untouched by lane 1 restart');

      const cli0 = fakeCli();
      assert.deepEqual(ensureStackCurrent({ cli: cli0, root: r0, markerFile: m0, checkTemplates: () => ({ ok: true }) }), { outcome: 'restarted' });
      assert.deepEqual(cli0.calls, [['status'], ['stop'], ['start']]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('EZD-172 L14 up wiring', () => {
    const local = read('scripts', 'db', 'local.mjs');
    const start = local.indexOf('async function up(');
    assert.ok(start >= 0, 'up() exists');
    const ends = [local.indexOf('\nasync function ', start + 1), local.indexOf('\nfunction ', start + 1)].filter(
      (i) => i > 0,
    );
    const body = local.slice(start, ends.length ? Math.min(...ends) : undefined);
    const prep = body.indexOf('prepareLaneWorkdir(');
    const ensure = body.indexOf('ensureStackCurrent(');
    assert.ok(prep >= 0, 'up() calls prepareLaneWorkdir(');
    assert.ok(ensure >= 0, 'up() calls ensureStackCurrent(');
    assert.ok(prep < ensure, 'prepareLaneWorkdir runs before ensureStackCurrent');
    assert.ok(body.includes('laneSuffixed(STACK_CONFIG_MARKER, lane)'), 'marker per lane');
    assert.ok(body.includes('root: workdir ?? repo'), 'hash over the lane folder');
    assert.ok(body.includes('projectId: projectId(), lane }'), 'the templates check gets the lane');
    assert.ok(
      !body.includes('path.join(sharedTempDir(repo), STACK_CONFIG_MARKER)'),
      'no single shared marker name',
    );
  });

  test('EZD-172 L15 up prepare error', () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd-172-l15-'));
    try {
      const real = realpathSync(tmp);
      const dbDir = path.join(real, 'scripts', 'db');
      mkdirSync(dbDir, { recursive: true });
      const srcDir = path.join(repo, 'scripts', 'db');
      for (const f of readdirSync(srcDir).filter((n) => n.endsWith('.mjs'))) {
        if (statSync(path.join(srcDir, f)).isFile()) copyFileSync(path.join(srcDir, f), path.join(dbDir, f));
      }
      mkdirSync(path.join(real, 'vault', 'tools'), { recursive: true });
      copyFileSync(path.join(repo, 'vault', 'tools', 'trusted-git.mjs'), path.join(real, 'vault', 'tools', 'trusted-git.mjs')); // EZD-345 D16: stack-config.mjs imports it
      const binDir = path.join(real, 'node_modules', '.bin');
      mkdirSync(binDir, { recursive: true });
      const fake = path.join(binDir, 'supabase');
      writeFileSync(
        fake,
        `#!${process.execPath}\n` +
          `require('node:fs').writeFileSync(${JSON.stringify(path.join(real, 'cli-called'))}, 'x');\n` +
          `process.exit(1);\n`,
      );
      chmodSync(fake, 0o755);
      mkdirSync(path.join(real, 'supabase'), { recursive: true });
      copyFileSync(path.join(repo, 'supabase', 'config.toml'), path.join(real, 'supabase', 'config.toml'));
      const env = { ...process.env, EZD_LANE: '1', SUPABASE_WORKDIR: path.join(real, '.lanes', 'lane1') };
      delete env.EZD_TEST_GREP;
      delete env.EZD_PHASE;
      delete env.NODE_TEST_CONTEXT;
      const r = spawnSync(process.execPath, [path.join(dbDir, 'local.mjs'), 'up'], {
        cwd: real,
        encoding: 'utf8',
        env,
      });
      assert.equal(r.status, 1, `exit 1: ${r.stdout}${r.stderr}`);
      assert.equal(r.stdout, '');
      assert.equal(
        r.stderr,
        'supabase/config.toml has no project_id, site_url or port line the lanes need.\n',
      );
      assert.ok(!r.stderr.includes('    at '), 'no stack trace');
      assert.equal(existsSync(path.join(real, 'cli-called')), false, 'no CLI call');
      assert.equal(existsSync(path.join(real, '.lanes')), false, 'no .lanes folder');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
  test('EZD-172 L16 local.mjs stop-lane', () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd-172-l16-'));
    try {
      const real = realpathSync(tmp);
      const dbDir = path.join(real, 'scripts', 'db');
      mkdirSync(dbDir, { recursive: true });
      const srcDir = path.join(repo, 'scripts', 'db');
      for (const f of readdirSync(srcDir).filter((n) => n.endsWith('.mjs'))) {
        if (statSync(path.join(srcDir, f)).isFile()) copyFileSync(path.join(srcDir, f), path.join(dbDir, f));
      }
      mkdirSync(path.join(real, 'vault', 'tools'), { recursive: true });
      copyFileSync(path.join(repo, 'vault', 'tools', 'trusted-git.mjs'), path.join(real, 'vault', 'tools', 'trusted-git.mjs')); // EZD-345 D16: stack-config.mjs imports it
      const called = path.join(real, 'cli-called');
      const binDir = path.join(real, 'node_modules', '.bin');
      mkdirSync(binDir, { recursive: true });
      const fake = path.join(binDir, 'supabase');
      writeFileSync(
        fake,
        `#!${process.execPath}\n` +
          `require('node:fs').writeFileSync(${JSON.stringify(called)}, process.argv.slice(2).join(' '));\n` +
          `process.exit(Number(process.env.FAKE_CLI_EXIT || 0));\n`,
      );
      chmodSync(fake, 0o755);
      const sup = path.join(real, 'supabase');
      mkdirSync(path.join(sup, 'migrations'), { recursive: true });
      mkdirSync(path.join(sup, 'templates'), { recursive: true });
      for (const f of ['config.toml', 'seed.sql']) copyFileSync(path.join(repo, 'supabase', f), path.join(sup, f));
      for (const d of ['migrations', 'templates']) {
        for (const f of readdirSync(path.join(repo, 'supabase', d))) {
          const src = path.join(repo, 'supabase', d, f);
          if (statSync(src).isFile()) copyFileSync(src, path.join(sup, d, f));
        }
      }
      const run = (extra) => {
        rmSync(called, { force: true });
        const env = { ...process.env, ...extra };
        delete env.EZD_TEST_GREP;
        delete env.EZD_PHASE;
        delete env.NODE_TEST_CONTEXT;
        if (!extra.EZD_LANE) delete env.EZD_LANE;
        if (!extra.SUPABASE_WORKDIR) delete env.SUPABASE_WORKDIR;
        return spawnSync(process.execPath, [path.join(dbDir, 'local.mjs'), 'stop-lane'], {
          cwd: real,
          encoding: 'utf8',
          env,
        });
      };
      const wd = (n) => path.join(real, '.lanes', `lane${n}`);

      const a = run({ EZD_LANE: '2', SUPABASE_WORKDIR: wd(2) });
      assert.equal(a.status, 0, `${a.stdout}${a.stderr}`);
      assert.equal(a.stdout, '');
      assert.equal(readFileSync(called, 'utf8'), 'stop --project-id ezdraft-lane2');
      assert.ok(existsSync(path.join(wd(2), 'supabase', 'config.toml')), 'lane folder prepared');

      const b = run({});
      assert.equal(b.status, 1);
      assert.equal(b.stdout, '');
      assert.equal(
        b.stderr,
        "stop-lane is for lanes 1-3; lane 0's stack keeps running (pnpm db:stop stops it).\n",
      );
      assert.equal(existsSync(called), false, 'no CLI call');

      const c = run({ EZD_LANE: '2', SUPABASE_WORKDIR: wd(2), FAKE_CLI_EXIT: '1' });
      assert.equal(c.status, 1);
      assert.ok(c.stderr.includes('supabase stop failed (exit 1)'), c.stderr);

      const d = run({ EZD_LANE: '1' });
      assert.equal(d.status, 1);
      assert.ok(d.stderr.includes(`SUPABASE_WORKDIR=${wd(1)}`), d.stderr);
      assert.equal(existsSync(called), false, 'no CLI call');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
