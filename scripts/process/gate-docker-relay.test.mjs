// EZD-354 R1-R2 (vault/plans/EZD-354.md sections 3 and 4): the Docker relay is a plain forwarder whose socket only the named user can use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const darwin = process.platform === 'darwin';
const relayFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'gate-docker-relay.mjs');
const name = os.userInfo().username;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('EZD-354 R1 relay pipes and locks', { skip: !darwin }, async () => {
  const { startRelay } = await import('../gate-docker-relay.mjs');
  const d = mkdtempSync(path.join(os.tmpdir(), 'ezr1-'));
  const up = path.join(d, 'u.sock');
  const sock = path.join(d, 'r.sock');
  const upstream = net.createServer((c) => c.pipe(c));
  let relay;
  try {
    await new Promise((res) => upstream.listen(up, res));
    relay = await startRelay(sock, up, name);
    const msg = 'GET /_ping HTTP/1.1\r\nHost: d\r\n\r\n';
    const got = await new Promise((res, rej) => {
      const c = net.connect(sock);
      let buf = '';
      c.on('data', (b) => { buf += b; if (buf.length >= msg.length) { c.destroy(); res(buf); } });
      c.on('error', rej);
      c.write(msg);
    });
    assert.equal(got, msg, 'R1 bytes echoed unchanged');
    assert.equal(statSync(sock).mode & 0o777, 0o600, 'R1 socket mode');
    const ls = spawnSync('/bin/ls', ['-led', sock], { encoding: 'utf8' });
    assert.ok(ls.stdout.includes(`user:${name} allow read,write`), `R1 ACL entry: ${ls.stdout}`);
  } finally {
    relay?.close();
    upstream.close();
    rmSync(d, { recursive: true, force: true });
  }
});

test('EZD-354 R1b relay keeps a half-closed client open for the reply', { skip: !darwin }, async () => {
  const { startRelay } = await import('../gate-docker-relay.mjs');
  const d = mkdtempSync(path.join(os.tmpdir(), 'ezr1b-'));
  const up = path.join(d, 'u.sock');
  const sock = path.join(d, 'r.sock');
  const upstream = net.createServer({ allowHalfOpen: true }, (c) => {
    let got = '';
    c.on('data', (b) => { got += b; });
    c.on('end', () => { c.write(`got:${got}`); c.end(); });
  });
  let relay;
  let client;
  try {
    await new Promise((res) => upstream.listen(up, res));
    relay = await startRelay(sock, up, name);
    const reply = await new Promise((res, rej) => {
      let buf = '';
      const timer = setTimeout(() => rej(new Error(`R1b no complete reply within 3000 ms (got ${JSON.stringify(buf)})`)), 3000);
      client = net.connect({ path: sock, allowHalfOpen: true });
      client.on('data', (b) => { buf += b; });
      client.on('close', () => { clearTimeout(timer); res(buf); });
      client.on('error', (e) => { clearTimeout(timer); rej(e); });
      client.write('ping');
      client.end();
    });
    assert.equal(reply, 'got:ping', 'R1b reply after the client half-closed');
  } finally {
    client?.destroy();
    relay?.close();
    upstream.close();
    rmSync(d, { recursive: true, force: true });
  }
});

test('EZD-354 R1c relay delivers a large reply in full when the upstream closes at once', { skip: !darwin, timeout: 20000 }, async () => {
  const { startRelay } = await import('../gate-docker-relay.mjs');
  const SIZE = 16 * 1024 * 1024;
  const pattern = Buffer.alloc(SIZE);
  for (let i = 0; i < SIZE; i++) pattern[i] = i % 251;
  const d = mkdtempSync(path.join(os.tmpdir(), 'ezr1c-'));
  const up = path.join(d, 'u.sock');
  const sock = path.join(d, 'r.sock');
  const upstream = net.createServer({ allowHalfOpen: true }, (c) => {
    c.on('error', () => {});
    c.write(pattern);
    c.end();
  });
  let relay;
  let client;
  try {
    await new Promise((res) => upstream.listen(up, res));
    relay = await startRelay(sock, up, name);
    const chunks = await new Promise((res, rej) => {
      const got = [];
      const timer = setTimeout(() => rej(new Error('R1c no complete reply within 15000 ms')), 15000);
      client = net.connect({ path: sock, allowHalfOpen: true });
      client.on('data', (b) => got.push(b));
      client.on('end', () => { clearTimeout(timer); res(got); });
      client.on('error', (e) => { clearTimeout(timer); rej(e); });
      client.pause();
      client.end(); // the docker CLI half-closes after its request; with both sides ended the upstream closes at once
      setTimeout(() => client.resume(), 500);
    });
    const all = Buffer.concat(chunks);
    assert.equal(all.length, SIZE, 'R1c total length');
    assert.ok(all.equals(pattern), 'R1c bytes equal the pattern');
  } finally {
    client?.destroy();
    relay?.close();
    upstream.close();
    rmSync(d, { recursive: true, force: true });
  }
});

test('EZD-354 R2 relay CLI', { skip: !darwin }, async () => {
  const d = mkdtempSync(path.join(os.tmpdir(), 'ezr2-'));
  let child;
  try {
    const file = path.join(d, 'plain');
    writeFileSync(file, 'keep');
    const a = spawnSync(process.execPath, [relayFile, file, path.join(d, 'u.sock'), name], { encoding: 'utf8' });
    assert.equal(a.status, 2, 'R2 (a) exit code');
    assert.equal(a.stderr.trim(), `relay: ${file} exists and is not a socket`, 'R2 (a) stderr');
    assert.equal(readFileSync(file, 'utf8'), 'keep', 'R2 (a) file unchanged');
    const sock = path.join(d, 'r.sock');
    child = spawn(process.execPath, [relayFile, sock, path.join(d, 'u.sock'), name], { stdio: ['pipe', 'ignore', 'pipe'] });
    const closed = new Promise((res) => child.on('close', (code) => res(code)));
    for (let i = 0; i < 100 && !existsSync(sock); i++) await wait(50);
    assert.ok(existsSync(sock), 'R2 (b) socket appeared');
    const t0 = Date.now();
    child.stdin.end();
    const code = await Promise.race([closed, wait(2000).then(() => 'timeout')]);
    assert.equal(code, 0, 'R2 (b) exit 0 within 2000 ms');
    assert.ok(Date.now() - t0 < 2000, 'R2 (b) time');
    assert.equal(existsSync(sock), false, 'R2 (b) socket gone');
  } finally {
    child?.kill('SIGKILL');
    rmSync(d, { recursive: true, force: true });
  }
});
