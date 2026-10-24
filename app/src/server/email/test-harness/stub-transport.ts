// EZD-008a Step 3 · stub email transport (harness). Records messages in memory and, with `dir`, as JSON files.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EmailMessage, EmailTransport } from '../types';

export type StubMessage = EmailMessage & {
  id: string;
  idempotencyKey: string | null;
  sentAt: string;
};

type G = typeof globalThis & { __ezdEmailStubOutbox?: StubMessage[]; __ezdEmailStubSeq?: number };
const g = globalThis as G;

function outbox(): StubMessage[] {
  if (!g.__ezdEmailStubOutbox) g.__ezdEmailStubOutbox = [];
  return g.__ezdEmailStubOutbox;
}

export function readStubOutbox(): StubMessage[] {
  return outbox().map((m) => ({ ...m }));
}

export function clearStubOutbox(): void {
  g.__ezdEmailStubOutbox = [];
}

export function createStubTransport(opts: { dir?: string } = {}): EmailTransport {
  return {
    name: 'stub',
    async send(message, sendOpts) {
      const key = sendOpts?.idempotencyKey ?? null;
      const box = outbox();
      if (key !== null) {
        const first = box.find((m) => m.idempotencyKey === key);
        if (first) return { ok: true, messageId: first.id };
      }
      const id = 'stub_' + crypto.randomUUID();
      const record: StubMessage = {
        from: message.from,
        to: message.to,
        ...(message.replyTo !== undefined ? { replyTo: message.replyTo } : {}),
        subject: message.subject,
        text: message.text,
        html: message.html,
        id,
        idempotencyKey: key,
        sentAt: new Date().toISOString(),
      };
      box.push(record);
      if (opts.dir) {
        mkdirSync(opts.dir, { recursive: true });
        g.__ezdEmailStubSeq = (g.__ezdEmailStubSeq ?? 0) + 1;
        const seq = String(g.__ezdEmailStubSeq).padStart(6, '0');
        const ms = String(Date.now()).padStart(13, '0');
        writeFileSync(join(opts.dir, `${ms}-${seq}-${id}.json`), JSON.stringify(record));
      }
      return { ok: true, messageId: id };
    },
  };
}
