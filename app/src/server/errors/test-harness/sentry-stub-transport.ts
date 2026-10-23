// EZD-024 Step 2 (vault/plans/EZD-024.md): the Sentry stub transport (harness). Follows the EZD-008a stub
// pattern: envelopes are recorded in memory on globalThis (key __ezdSentryStubOutbox) and, with `dir`, as
// JSON files, so a browser test can read what the `next start` process recorded. It answers 200 and makes no
// network request. It implements the SDK's Transport shape ({ send, flush }) directly and imports nothing
// from @sentry/*, so it does not depend on which package exports createTransport.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type StubEnvelopeItem = { header: Record<string, unknown>; payload: unknown };
export type StubEnvelope = {
  header: Record<string, unknown>;
  items: StubEnvelopeItem[];
  receivedAt: string;
};

type G = typeof globalThis & {
  __ezdSentryStubOutbox?: StubEnvelope[];
  __ezdSentryStubSeq?: number;
};
const g = globalThis as G;

function outbox(): StubEnvelope[] {
  if (!g.__ezdSentryStubOutbox) g.__ezdSentryStubOutbox = [];
  return g.__ezdSentryStubOutbox;
}

export function readSentryStubOutbox(): StubEnvelope[] {
  return outbox().map((e) => ({ ...e }));
}

export function clearSentryStubOutbox(): void {
  g.__ezdSentryStubOutbox = [];
}

function decodePayload(payload: unknown): unknown {
  const text =
    payload instanceof Uint8Array
      ? new TextDecoder().decode(payload)
      : typeof payload === 'string'
        ? payload
        : null;
  if (text === null) return payload;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

type RawEnvelope = [Record<string, unknown>, Array<[Record<string, unknown>, unknown]>];

// The factory is what Sentry.init({ transport }) takes: it is called with the transport options and returns
// the transport.
export function createSentryStubTransport(opts: { dir?: string } = {}) {
  return () => ({
    async send(envelope: unknown) {
      const [header, rawItems] = envelope as RawEnvelope;
      const record: StubEnvelope = {
        header: { ...header },
        items: rawItems.map(([itemHeader, payload]) => ({
          header: { ...itemHeader },
          payload: decodePayload(payload),
        })),
        receivedAt: new Date().toISOString(),
      };
      outbox().push(record);
      if (opts.dir) {
        mkdirSync(opts.dir, { recursive: true });
        g.__ezdSentryStubSeq = (g.__ezdSentryStubSeq ?? 0) + 1;
        const seq = String(g.__ezdSentryStubSeq).padStart(6, '0');
        const ms = String(Date.now()).padStart(13, '0');
        writeFileSync(join(opts.dir, `${ms}-${seq}.json`), JSON.stringify(record));
      }
      return { statusCode: 200 };
    },
    async flush() {
      return true;
    },
  });
}
