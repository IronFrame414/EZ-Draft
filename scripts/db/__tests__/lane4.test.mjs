// EZD-2001 (AC-EZD-2001-1, AC-EZD-2001-2, AC-EZD-2001-3): a fourth build lane, lane 4. node:test, Node 22 built-ins only.
// Expected values are literal, from the ticket (Josh 2026-11-27): web 3040, perf 3240, stack ports base + 400
// (the committed supabase/config.toml ports: api 54321, db 54322, shadow 54320, pooler 54329, studio 54323,
// mail 54324, analytics 54327, inspector 8083), project id ezdraft-lane4, folder .lanes/lane4/. No docker, launchctl
// or database (AC-EZD-2001-3): the only child process is `local.mjs lane`, which reads the config and prints JSON.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const url = (...p) => pathToFileURL(path.join(repo, ...p)).href;
const lane = await import(url('scripts', 'db', 'lane.mjs'));
const { laneOfLine } = await import(url('scripts', 'db', 'base.mjs'));
const { configLanes } = await import(url('scripts', 'loop', 'lanes.mjs'));
const committed = readFileSync(path.join(repo, 'supabase', 'config.toml'), 'utf8');

const LANE4_PORTS = {
  api: 54721,
  db: 54722,
  shadow: 54720,
  pooler: 54729,
  studio: 54723,
  mail: 54724,
  analytics: 54727,
  inspector: 8483,
};

function cleanEnv(extra = {}) {
  const env = { ...process.env };
  for (const k of ['EZD_TEST_GREP', 'EZD_PHASE', 'NODE_TEST_CONTEXT', 'EZD_LANE', 'SUPABASE_WORKDIR']) delete env[k];
  return { ...env, ...extra };
}
const laneCli = (extra) =>
  spawnSync(process.execPath, [path.join(repo, 'scripts', 'db', 'local.mjs'), 'lane'], {
    cwd: repo,
    env: cleanEnv(extra),
    encoding: 'utf8',
  });

describe('EZD-2001 lane 4', () => {
  test('AC-EZD-2001-1, AC-EZD-2001-3 EZD_LANE=4 is accepted; 5 and other values are lane_invalid', () => {
    assert.equal(lane.MAX_LANE, 4);
    assert.equal(lane.readLane({ EZD_LANE: '4' }), 4);
    for (const v of ['5', '6', '9', '10', '04', '4 ', '-4']) {
      assert.throws(
        () => lane.readLane({ EZD_LANE: v }),
        (e) => e.code === 'lane_invalid' && e.message === `EZD_LANE must be 0, 1, 2, 3 or 4 (got "${v}").`,
        `value ${JSON.stringify(v)}`,
      );
    }
    assert.doesNotThrow(() => lane.laneConfigToml(committed, 4));
    assert.throws(() => lane.laneConfigToml(committed, 5), { code: 'lane_invalid' });
  });

  test('AC-EZD-2001-1, AC-EZD-2001-3 lane 4 ports, project id, folder and config', () => {
    assert.deepEqual(lane.laneAppPorts(4), { web: 3040, perf: 3240 });
    assert.deepEqual(lane.lanePorts(committed, 4), LANE4_PORTS);
    assert.equal(lane.laneProjectId('ezdraft', 4), 'ezdraft-lane4');
    assert.equal(lane.stackContainer('db', 'ezdraft', 4), 'supabase_db_ezdraft-lane4');
    assert.equal(lane.laneSuffixed('ezdraft-gate.lock', 4), 'ezdraft-gate.lock-lane4');
    assert.equal(lane.laneWorkdir('/r', 4), path.join('/r', '.lanes', 'lane4'));
    const toml = lane.laneConfigToml(committed, 4);
    assert.match(toml, /^project_id = "ezdraft-lane4"$/m);
    assert.match(toml, /^site_url = "http:\/\/127\.0\.0\.1:3040"$/m);
    assert.match(toml, /^port = 54721$/m);
    assert.match(toml, /^shadow_port = 54720$/m);
    assert.match(toml, /^inspector_port = 8483$/m);
    const ws = '/r/.lanes/lane4';
    assert.deepEqual(lane.checkLaneEnv({ EZD_LANE: '4', SUPABASE_WORKDIR: ws }, '/r'), { lane: 4, workdir: ws });
    assert.throws(
      () => lane.checkLaneEnv({ EZD_LANE: '4', SUPABASE_WORKDIR: '/r/.lanes/lane3' }, '/r'),
      { code: 'lane_env_mismatch' },
    );
  });

  test('AC-EZD-2001-1 local.mjs lane prints lane 4 and refuses lane 5', () => {
    const r4 = laneCli({ EZD_LANE: '4' });
    assert.equal(r4.status, 0, r4.stderr);
    const info = JSON.parse(r4.stdout.trim());
    assert.equal(info.lane, 4);
    assert.equal(info.projectId, 'ezdraft-lane4');
    assert.equal(info.web, 3040);
    assert.equal(info.perf, 3240);
    assert.deepEqual(info.ports, LANE4_PORTS);
    assert.equal(info.workdir, path.join(repo, '.lanes', 'lane4'));
    assert.deepEqual(info.env, { EZD_LANE: '4', SUPABASE_WORKDIR: path.join(repo, '.lanes', 'lane4') });
    const r5 = laneCli({ EZD_LANE: '5' });
    assert.equal(r5.status, 1);
    assert.equal(r5.stdout, '');
    assert.ok(r5.stderr.includes('EZD_LANE must be 0, 1, 2, 3 or 4 (got "5")'), r5.stderr);
  });

  test('AC-EZD-2001-1 a lane-4 gate is lane 4 to db:base, not a lane-0 holder', () => {
    assert.equal(laneOfLine('123 node /w/scripts/check.mjs /w EZD_LANE=4 HOME=/x'), 4);
    assert.equal(laneOfLine('123 node /w/scripts/check.mjs /w EZD_LANE=3 HOME=/x'), 3);
    assert.equal(laneOfLine('123 node /w/scripts/check.mjs /w EZD_LANE=5 HOME=/x'), 0);
    assert.equal(laneOfLine('123 node /w/scripts/check.mjs /w HOME=/x'), 0);
  });

  test('AC-EZD-2001-2 lanes 0-3 keep their ports, project ids and folders', () => {
    const before = {
      0: { id: 'ezdraft', web: 3000, perf: 3200, api: 54321, dir: null },
      1: { id: 'ezdraft-lane1', web: 3010, perf: 3210, api: 54421, dir: path.join('/r', '.lanes', 'lane1') },
      2: { id: 'ezdraft-lane2', web: 3020, perf: 3220, api: 54521, dir: path.join('/r', '.lanes', 'lane2') },
      3: { id: 'ezdraft-lane3', web: 3030, perf: 3230, api: 54621, dir: path.join('/r', '.lanes', 'lane3') },
    };
    for (const [n, want] of Object.entries(before).map(([k, v]) => [Number(k), v])) {
      assert.equal(lane.laneProjectId('ezdraft', n), want.id);
      assert.deepEqual(lane.laneAppPorts(n), { web: want.web, perf: want.perf });
      assert.equal(lane.lanePorts(committed, n).api, want.api);
      assert.equal(lane.laneWorkdir('/r', n), want.dir);
    }
  });

  test('AC-EZD-2001-2 config lanes: [1,2,3] runs as today; adding 4 turns lane 4 on', () => {
    assert.deepEqual(configLanes({ lanes: [1, 2, 3] }), [1, 2, 3]);
    assert.deepEqual(configLanes({ lanes: [1, 2, 3, 4] }), [1, 2, 3, 4]);
    assert.deepEqual(configLanes({ lanes: [4, 1, 3, 2, 4] }), [1, 2, 3, 4]);
    assert.deepEqual(configLanes({ lanes: [1, 2, 3, 4, 5] }), [1, 2, 3, 4], 'lane 5 is still not a lane');
    assert.deepEqual(configLanes({ lanes: [-1, 1.5, 'x', 2] }), [2]);
    assert.deepEqual(configLanes({}), [0]);
    assert.deepEqual(configLanes({ lanes: 3 }), [0, 1, 2]);
    assert.deepEqual(configLanes({ lanes: 5 }), [0, 1, 2, 3, 4]);
    assert.deepEqual(configLanes({ lanes: 9 }), [0, 1, 2, 3, 4]);
  });
});
