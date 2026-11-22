'use client';
// EZD-1402 (AC-EZD-1402-2): queues a task check and a photo pin through the page's field sender, and shows what
// waits on this device (count, size, each action's state). Dev only; English test text.
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useFieldSync, useOutboxActor } from '../../../../components/outbox/OutboxDrain';
import { photoExtOf, type FieldAction, type QueueReadout } from '../../../../lib/outbox/field-action';
import { createFieldQueue } from '../../../../lib/outbox/field-queue';

export function FieldOutboxBench({ projectId }: { projectId: string }): ReactElement {
  const sync = useFieldSync();
  const actor = useOutboxActor();
  const [taskId, setTaskId] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [actions, setActions] = useState<FieldAction[]>([]);
  const [readout, setReadout] = useState<QueueReadout | null>(null);

  const read = useCallback(async () => {
    if (actor === null) return;
    const q = createFieldQueue(actor);
    try {
      setActions(await q.list());
      setReadout(await q.readout());
    } finally {
      q.close();
    }
  }, [actor]);

  useEffect(() => {
    void read();
    return sync?.subscribe(() => void read());
  }, [sync, read]);

  const queueTask = async () => {
    if (sync === null || taskId === '') return;
    await sync.add({ projectId, kind: 'task_check', ops: { taskId, done: true } });
    await read();
  };

  const queuePhoto = async () => {
    const ext = photo ? photoExtOf(photo.type) : null;
    if (sync === null || photo === null || ext === null) return;
    await sync.add({
      projectId,
      kind: 'photo_pin',
      ops: { x: 0.5, y: 0.5, note: 'Bench photo' },
      photo: { blob: photo, ext },
    });
    await read();
  };

  return (
    <div data-testid="field-bench" data-ready={sync !== null ? 'true' : 'false'}>
      <input
        data-testid="field-bench-task"
        aria-label="Task id"
        value={taskId}
        onChange={(e) => setTaskId(e.target.value)}
      />
      <button type="button" data-testid="field-bench-check" onClick={() => void queueTask()}>
        Queue task check
      </button>
      <input
        data-testid="field-bench-photo"
        aria-label="Photo"
        type="file"
        accept="image/jpeg,image/png"
        onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
      />
      <button type="button" data-testid="field-bench-pin" onClick={() => void queuePhoto()}>
        Queue photo pin
      </button>
      <span
        data-testid="field-bench-readout"
        data-count={readout?.count ?? ''}
        data-bytes={readout?.bytes ?? ''}
      >
        {readout ? `Queued: ${readout.count} · ${readout.bytes} bytes` : ''}
      </span>
      <ul data-testid="field-bench-actions">
        {actions.map((a) => (
          <li key={a.id} data-kind={a.kind} data-state={a.state} data-id={a.id}>
            {a.kind} · {a.state}
          </li>
        ))}
      </ul>
    </div>
  );
}
