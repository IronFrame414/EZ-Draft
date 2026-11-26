'use client';
// EZD-1417 (S17b Send to office "Sends rooms to the project; office notified. Works offline, queued until online";
// States "offline (saved on phone); sent"): Send to office queues one field_measure_send field action with the rooms
// (EZD-1402's outbox, so it waits on the phone while offline and goes on reconnect). The status is read from the
// queue: queued while the action waits, refused when the server refused it for good (kept on the phone), sent once
// it has left the queue or when the server already shows the rooms sent.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFieldSync, useOutboxActor } from '../components/outbox/OutboxDrain';
import { createFieldQueue } from '../lib/outbox/field-queue';
import type { FieldRoom } from './room-model';

export type SendStatus = 'idle' | 'queued' | 'sent' | 'refused';

export type MeasureSend = {
  status: SendStatus;
  /** False until the page's field sender has started. */
  ready: boolean;
  send(rooms: FieldRoom[]): Promise<boolean>;
};

export function useMeasureSend(projectId: string, sentAt: string | null): MeasureSend {
  const sync = useFieldSync();
  const actor = useOutboxActor();
  const [status, setStatus] = useState<SendStatus>(sentAt !== null ? 'sent' : 'idle');
  // True from the tap on Send to office until the action has left the queue.
  const waiting = useRef(false);

  const read = useCallback(async () => {
    if (actor === null) return;
    const q = createFieldQueue(actor);
    try {
      const mine = (await q.list()).filter(
        (a) => a.projectId === projectId && a.kind === 'field_measure_send',
      );
      if (mine.some((a) => a.state === 'refused')) {
        waiting.current = false;
        setStatus('refused');
      } else if (mine.length > 0) {
        waiting.current = true;
        setStatus('queued');
      } else if (waiting.current) {
        waiting.current = false;
        setStatus('sent');
      }
    } catch {
      /* the device database could not be read: the status stays */
    } finally {
      q.close();
    }
  }, [actor, projectId]);

  // Read from a microtask, not in the effect body (react-hooks/set-state-in-effect; as BenchmarkPlan does).
  useEffect(() => {
    queueMicrotask(() => void read());
    return sync?.subscribe(() => void read());
  }, [sync, read]);

  const send = useCallback(
    async (rooms: FieldRoom[]) => {
      if (sync === null) return false;
      waiting.current = true;
      setStatus('queued');
      try {
        await sync.add({ projectId, kind: 'field_measure_send', ops: { rooms } });
      } catch {
        waiting.current = false;
        setStatus('idle');
        return false;
      }
      await read();
      return true;
    },
    [sync, projectId, read],
  );

  return { status, ready: sync !== null, send };
}
