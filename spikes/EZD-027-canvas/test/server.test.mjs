// EZD-027 U7 server allowlist, U8 LAN only on request (vault/plans/EZD-027.md Step 2, Tests table).
// createSpikeServer is taken to return a node:http Server (the plan says it listens on an ephemeral port).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { createSpikeServer, listenOptions } from '../server.mjs';

function request(port, method, rawPath, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: rawPath }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

describe('EZD-027 spike server', () => {
  let server;
  let port;
  let dir;
  before(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'ezd027-'));
    server = createSpikeServer({ outDir: dir });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
  });
  after(async () => {
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  });

  test('U7 allowlist: served files, 404 for everything else, results writer', async () => {
    let r = await request(port, 'GET', '/');
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /text\/html/);
    r = await request(port, 'GET', '/main.mjs');
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /text\/javascript/);
    r = await request(port, 'GET', '/vendor/three.module.js');
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /text\/javascript/);
    r = await request(port, 'GET', '/fonts/dm-mono-latin-400-normal.woff2');
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /font\/woff2/);
    assert.equal(r.body.subarray(0, 4).toString('latin1'), 'wOF2');
    r = await request(port, 'GET', '/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.toString().trim(), 'ok');

    for (const p of ['/../package.json', '/%2e%2e/server.mjs', '/public/', '/vendor/../package.json', '/fonts/x.woff2']) {
      r = await request(port, 'GET', p);
      assert.equal(r.status, 404, p);
    }

    const valid = { ticket: 'EZD-027', device: { label: 'iPad Pro!' }, x: 1 };
    r = await request(port, 'POST', '/results', JSON.stringify(valid));
    assert.equal(r.status, 201);
    const { file } = JSON.parse(r.body.toString());
    assert.match(file, /^results-ipadpro-\d{8}T\d{9}Z\.json$/);
    assert.ok(existsSync(path.join(dir, file)));
    assert.deepEqual(JSON.parse(readFileSync(path.join(dir, file), 'utf8')), valid);
    const before1 = readdirSync(dir).length;

    r = await request(port, 'POST', '/results', '{not json');
    assert.equal(r.status, 400);
    r = await request(port, 'POST', '/results', JSON.stringify({ ticket: 'X' }));
    assert.equal(r.status, 400);
    r = await request(port, 'POST', '/results', Buffer.alloc(1048577, 0x61));
    assert.equal(r.status, 413);
    assert.equal(readdirSync(dir).length, before1);
  });

  test('U8 LAN only on request', () => {
    const pick = (o) => ({ host: o.host, port: o.port });
    assert.deepEqual(pick(listenOptions([])), { host: '127.0.0.1', port: 4027 });
    assert.deepEqual(pick(listenOptions(['--lan'])), { host: '0.0.0.0', port: 4027 });
    assert.deepEqual(pick(listenOptions(['--port', '5000'])), { host: '127.0.0.1', port: 5000 });
  });
});
