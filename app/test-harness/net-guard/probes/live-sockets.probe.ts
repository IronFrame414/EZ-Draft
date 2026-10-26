// EZD-159 D9: five raw socket calls to live hosts, each with no try/catch, so its NetGuardError fails the
// test. Run only by net-guard.test.ts (T1).
import net from 'node:net';
import tls from 'node:tls';
import { describe, it } from 'vitest';

describe('EZD-159 probe: live sockets', () => {
  it('EZD-159 probe tls.connect to api.anthropic.com', () => {
    tls.connect(443, 'api.anthropic.com');
  });
  it('EZD-159 probe net.connect to api.openai.com', () => {
    net.connect(443, 'api.openai.com');
  });
  it('EZD-159 probe net.createConnection to api.resend.com', () => {
    net.createConnection({ host: 'api.resend.com', port: 443 });
  });
  it('EZD-159 probe Socket.connect to api.bfl.ai', () => {
    new net.Socket().connect(443, 'api.bfl.ai');
  });
  it('EZD-159 probe WebSocket to o1.ingest.sentry.io', () => {
    new WebSocket('wss://o1.ingest.sentry.io/api/1/');
  });
});
