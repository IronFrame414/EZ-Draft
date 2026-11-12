'use client';
// EZD-120d Build step 18 (vault/plans/EZD-120d.md section 3 and Decided "Test page", "Bench walls", "50 edits",
// "Fail next save", "Snapshot"; Q-0505; Q-0508): the save test page. The editor with a bar of two buttons: 50
// edits (watch how many rows the save writes) and Fail next save (the next save is refused, Retry saves). The
// bar and its texts are literal: a developer page.
// EZD-299 Build step 13 (vault/plans/EZD-299.md Decided D-Bench; C13; Q-0508): Make a conflict (someone else saves
// the first wall's height first, so this edit is refused and listed).
import { useMemo, useState } from 'react';
import { ProjectEditor } from '../../../../../editor/ProjectEditor';
import type { EditorSession } from '../../../../../editor/editor-session';
import type { Objects } from '../../../../../editor/model/patches';
import { fetchModel } from '../../../../../lib/outbox/model-api';
import { createOutboxSync, type OutboxSync } from '../../../../../lib/outbox/outbox-sync';
import {
  benchTargets,
  benchWalls,
  countWritten,
  createConflictFault,
  createSaveFault,
  fiftyEdits,
  waitForConflict,
  waitForSync,
} from './save-bench';
import styles from './SaveBench.module.css';

type Phase = 'idle' | 'running' | 'failed' | 'done';
type Result = { phase: Phase; rows: number; objects: number; checkpoints: number; target: string };
type Snapshot = { seqs: Map<string, number>; checkpoints: number };

const WAIT_MS = 30000;

async function snapshot(projectId: string): Promise<Snapshot | null> {
  const loaded = await fetchModel(projectId);
  if (!loaded.ok) return null;
  let checkpoints: unknown;
  try {
    const res = await fetch(`/api/dev/model/${encodeURIComponent(projectId)}`);
    if (res.status !== 200) return null;
    checkpoints = ((await res.json()) as { checkpoints?: unknown }).checkpoints;
  } catch {
    return null;
  }
  if (typeof checkpoints !== 'number') return null;
  return { seqs: new Map(loaded.model.objects.map((o) => [o.id, o.updatedSeq])), checkpoints };
}

// The floor with the lowest order.
function lowestFloor(objects: Objects): string | null {
  let best: { id: string; order: number } | null = null;
  for (const [id, value] of objects) {
    if (value.type !== 'floor') continue;
    const order = (value.data as { order?: number }).order ?? Number.MAX_SAFE_INTEGER;
    if (best === null || order < best.order) best = { id, order };
  }
  return best?.id ?? null;
}

// Resolves at the first save at or after `after`, once a retry has been pressed.
function untilSaved(sync: OutboxSync, after: number): Promise<void> {
  return new Promise((resolve) => {
    const unsubscribe = sync.subscribe((s) => {
      if (s.status === 'saved' && (s.lastSavedAt ?? 0) >= after) {
        unsubscribe();
        resolve();
      }
    });
  });
}

export function SaveBench({ projectId }: { projectId: string }) {
  const [fault] = useState(() => createSaveFault(fetch));
  const [conflict] = useState(() => createConflictFault(fault.fetchImpl));
  const [session, setSession] = useState<EditorSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>({
    phase: 'idle',
    rows: 0,
    objects: 0,
    checkpoints: 0,
    target: '',
  });
  const openDeps = useMemo(
    () => ({
      createSync: (o: Parameters<typeof createOutboxSync>[0]) =>
        createOutboxSync({ ...o, fetchImpl: conflict.fetchImpl }),
    }),
    [conflict],
  );

  const sync = session?.sync ?? null;
  const off = busy || session === null || sync === null || !session.model.viewer.canEdit;

  const run = async (kind: 'fifty' | 'fail' | 'conflict') => {
    if (session === null || sync === null) return;
    const store = session.store;
    const failed = (rows = 0) => setResult((r) => ({ ...r, phase: 'failed', rows }));
    setBusy(true);
    setResult((r) => ({ ...r, phase: 'running' }));
    try {
      let targets = benchTargets(store.getState().objects);
      if (targets.length < 5) {
        const floorId = lowestFloor(store.getState().objects);
        if (floorId === null) return failed();
        store.applyEdit(benchWalls(floorId));
        const state = await waitForSync(sync, Date.now(), WAIT_MS);
        if (state.status !== 'saved') return failed();
        targets = benchTargets(store.getState().objects);
      }
      // Decided "Snapshot": every run takes its own before and after; the seeding edit is before `before`.
      let before: Snapshot | null = null;
      let conflictTarget: string | null = null;
      const objects = store.getState().objects;
      if (kind === 'conflict') {
        before = await snapshot(projectId);
        if (before === null) return failed();
        const target = objects.get(targets[0]);
        if (target === undefined) return failed();
        conflictTarget = targets[0];
        const attributes = (target.data as { attributes: { height: number } }).attributes;
        conflict.arm();
        store.applyEdit([
          {
            id: targets[0],
            value: {
              ...target,
              data: {
                ...target.data,
                attributes: { ...attributes, height: attributes.height + 1 },
              },
            },
          },
        ]);
        await sync.flush();
        const listed = await waitForConflict(
          session.conflicts,
          `${projectId}/${targets[0]}`,
          WAIT_MS,
        );
        if (!listed) return failed();
      } else if (kind === 'fifty') {
        before = await snapshot(projectId);
        if (before === null) return failed();
        for (const edit of fiftyEdits(objects, targets)) store.applyEdit(edit);
        const state = await waitForSync(sync, Date.now(), WAIT_MS);
        if (state.status !== 'saved') return failed();
      } else {
        const target = objects.get(targets[0]);
        if (target === undefined) return failed();
        const attributes = (target.data as { attributes: { height: number } }).attributes;
        fault.arm();
        const at = Date.now();
        store.applyEdit([
          {
            id: targets[0],
            value: {
              ...target,
              data: {
                ...target.data,
                attributes: { ...attributes, height: attributes.height + 1 },
              },
            },
          },
        ]);
        // Drive the retries now (each flush is one send), so the failure does not wait on timers.
        for (let i = 0; i < 3 && sync.getState().status !== 'error'; i++) await sync.flush();
        // The refused sends wrote nothing, so this is still the baseline (Decided "Fail next save").
        before = await snapshot(projectId);
        if (before === null) return failed();
        const state = await waitForSync(sync, at, WAIT_MS);
        if (state.status === 'error') {
          fault.disarm();
          failed();
          await untilSaved(sync, at);
        } else if (state.status !== 'saved') {
          fault.disarm();
          return failed();
        }
      }

      const after = await snapshot(projectId);
      if (after === null) return failed();
      setResult({
        phase: 'done',
        rows: countWritten(before.seqs, after.seqs),
        objects: after.seqs.size,
        checkpoints: after.checkpoints - before.checkpoints,
        target: conflictTarget ?? '',
      });
    } finally {
      fault.disarm();
      conflict.disarm();
      setBusy(false);
    }
  };

  return (
    <>
      {/* EZD-340: the bar comes before the editor so the status-bar disclaimer stays last on the page (EZD-136, Q-0229). */}
      <div className={styles.bar}>
        <button
          type="button"
          data-testid="bench-fifty"
          disabled={off}
          onClick={() => void run('fifty')}
        >
          50 edits
        </button>
        <button
          type="button"
          data-testid="bench-fail"
          disabled={off}
          onClick={() => void run('fail')}
        >
          Fail next save
        </button>
        <button
          type="button"
          data-testid="bench-conflict"
          disabled={off}
          onClick={() => void run('conflict')}
        >
          Make a conflict
        </button>
        <span
          data-testid="bench-result"
          data-phase={result.phase}
          data-rows={result.rows}
          data-objects={result.objects}
          data-checkpoints={result.checkpoints}
          data-target={result.target}
        >
          {result.phase === 'running'
            ? 'Saving…'
            : result.phase === 'idle'
              ? ''
              : `Rows written: ${result.rows} of ${result.objects} · Checkpoints made: ${result.checkpoints}`}
        </span>
      </div>
      <ProjectEditor projectId={projectId} devHooks openDeps={openDeps} onSession={setSession} />
    </>
  );
}
