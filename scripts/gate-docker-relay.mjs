#!/usr/bin/env node
// The gate's Docker relay (EZD-354 C15, Q-0614): a plain forwarder, run as Josh, from a socket only the gate user can use
// (mode 0600 plus one ACL entry) to Josh's Docker Desktop socket. It checks no request; Docker Desktop's file sharing
// bounds what containers reach (docs/runbook.md, Gate user step 3). The policy relay is EZD-355.
//   node scripts/gate-docker-relay.mjs <listen> <upstream> <aclUser>     stops when stdin ends or on SIGTERM
import net from 'node:net';
import { chmodSync, lstatSync, renameSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function startRelay(listenPath, upstreamPath, aclUser) {
  return new Promise((resolve, reject) => {
    // Half-open both ways: the docker CLI ends its write side after an exec or attach request and still reads the reply.
    const server = net.createServer({ allowHalfOpen: true }, (client) => {
      const upstream = net.connect({ path: upstreamPath, allowHalfOpen: true });
      const both = () => { client.destroy(); upstream.destroy(); };
      client.on('error', both);
      upstream.on('error', both);
      // A side that closes ends the other gracefully (end flushes what is still buffered); only an error destroys both.
      client.on('close', () => upstream.end());
      upstream.on('close', () => client.end());
      client.pipe(upstream);
      upstream.pipe(client);
    });
    // The socket is bound under a temporary name and renamed into place only after its mode and ACL are set, so the
    // listen path never names a socket the gate user cannot use (the gate treats the path's appearance as "started").
    const tmp = `${listenPath}.${process.pid}.tmp`;
    const fail = (e) => { server.close(); try { unlinkSync(tmp); } catch { /* gone */ } reject(e); };
    server.once('error', reject);
    server.listen(tmp, () => {
      try {
        chmodSync(tmp, 0o600);
        const acl = spawnSync('/bin/chmod', ['+a', `user:${aclUser} allow read,write`, tmp], { encoding: 'utf8' });
        if (acl.status !== 0) { fail(new Error('acl failed')); return; }
        renameSync(tmp, listenPath);
      } catch (e) {
        fail(e);
        return;
      }
      server.off('error', reject);
      resolve(server);
    });
  });
}

async function main([listen, upstream, aclUser]) {
  let st = null;
  try { st = lstatSync(listen); } catch { /* none */ }
  if (st && !st.isSocket()) {
    process.stderr.write(`relay: ${listen} exists and is not a socket\n`);
    process.exit(2);
  }
  if (st) unlinkSync(listen);
  let server;
  try {
    server = await startRelay(listen, upstream, aclUser);
  } catch (e) {
    process.stderr.write(`relay: ${e?.message}\n`);
    process.exit(1);
  }
  server.on('error', (e) => { process.stderr.write(`relay: ${e?.message}\n`); process.exit(1); });
  const stop = () => {
    server.close();
    try { unlinkSync(listen); } catch { /* gone */ }
    process.exit(0);
  };
  process.stdin.on('end', stop);
  process.stdin.on('close', stop);
  process.stdin.resume();
  process.on('SIGTERM', stop);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
