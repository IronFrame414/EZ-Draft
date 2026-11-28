'use client';
// EZD-1404 (S17 States "First load: downloads and caches the pack; offline icon shows progress"; "Offline: fully
// usable after first load"; "Error: ... failure with Retry"; AC-EZD-1404-2 "With the network off the seeded pack
// opens"): loads /api/projects/<id>/field-pack through the project cache (lib/pwa/project-cache.ts), which stores
// the answer on this phone and answers from that copy with no network; the service worker keeps the page itself
// (sw-rules.mjs warmPageCopy). The offline icon reads that cache and this project's queued field actions.
// EZD-1409 (S17 Task row; States "Offline: tasks, photos ... queue as offline_change and sync on reconnect"): a task
// check and a task photo are queued field actions (EZD-1402); the tasks show them at once (tasks-view.ts overlay),
// including the ones still queued from before a reload. After each send the stored pack is read again while online,
// so a reload with no network shows the synced state. Edit text is online only (PATCH field-tasks/<task>).
// EZD-2002 (AC-EZD-2002-1): on a slow connection or a server error the stored pack answers (project-cache.ts); a
// pack that lands after that is shown in its place.
// EZD-2025 (audit 2026-11-27 A5, A6; Q-0903; AC-EZD-2025-3, -4): a task shows ticked only after its check is stored
// on the phone (a failed store answers 'failed' and the row says so). Checks the office refused for good are read from
// the queue (on open and after each send): they show unticked with "Not saved to the office. Retry", and Retry puts
// the check back in the queue and sends it. When the field sender cannot start, the Tasks tab says why its controls
// are missing (only to a member who holds one), and the start is tried again when the network comes back.
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { useFieldSender, useOutboxActor } from '../components/outbox/OutboxDrain';
import { PhoneFrame } from '../components/phone/PhoneFrame';
import { Skeleton } from '../components/states/Skeleton';
import { AsyncView } from '../components/states/AsyncView';
import { OfflineStatusIcon } from '../components/phone/OfflineStatusIcon';
import { useOnline } from '../lib/network';
import type { Language } from '../lib/messages/types';
import { FIELD_PHOTO_MAX_BYTES, photoExtOf } from '../lib/outbox/field-action';
import { createFieldQueue } from '../lib/outbox/field-queue';
import { createProjectCache } from '../lib/pwa/project-cache';
import type { FieldAction } from '../lib/outbox/field-action';
import type { FieldPackView as PackData } from './types';
import { FieldPackView } from './FieldPackView';
import { shownChecks, type TaskOverlay } from './tasks-view';
import type { CheckResult, PhotoResult, TaskActions } from './TasksPanel';

const taskIdOf = (ops: Record<string, unknown>): string | null =>
  typeof ops.taskId === 'string' ? ops.taskId : null;

export function FieldPackScreen({
  projectId,
  language,
  canPhoto,
  canCheck = false,
  canEdit = false,
  userName = null,
}: {
  projectId: string;
  language: Language;
  canPhoto: boolean;
  canCheck?: boolean;
  canEdit?: boolean;
  // Shown as who checked a task checked on this phone.
  userName?: string | null;
}): ReactElement {
  const cache = useMemo(() => createProjectCache(), [projectId]);
  const actor = useOutboxActor();
  const sender = useFieldSender();
  const sync = sender.sync;
  const online = useOnline();
  const [checked, setChecked] = useState<ReadonlyMap<string, number>>(new Map());
  const [photos, setPhotos] = useState<ReadonlyMap<string, number>>(new Map());
  const [edited, setEdited] = useState<TaskOverlay['edited']>(new Map());
  // EZD-2002: the pack that landed after the stored pack answered.
  const [fresh, setFresh] = useState<PackData | null>(null);
  // EZD-2025: task id → this project's task check the office refused for good (kept on the phone).
  const [refused, setRefused] = useState<ReadonlyMap<string, FieldAction>>(new Map());

  const packUrl = `/api/projects/${projectId}/field-pack`;
  // EZD-2028: fetch is looked up on each read, so the pack read goes through the version check the root layout
  // installs (version-fetch.ts) even when this screen renders first; a newer build then shows the reload notice.
  const fetchPack = useMemo(() => cache.wrap((...a) => globalThis.fetch(...a)), [cache]);

  const load = useCallback(
    async (signal: AbortSignal): Promise<PackData> => {
      const res = await fetchPack(packUrl, { signal, credentials: 'same-origin' });
      if (!res.ok) throw new Error(`field pack ${res.status}`);
      return (await res.json()) as PackData;
    },
    [fetchPack, packUrl],
  );

  useEffect(
    () =>
      cache.fresh((href, body) => {
        if (new URL(href).pathname === packUrl) setFresh(body as PackData);
      }),
    [cache, packUrl],
  );

  const queued = useCallback(async () => {
    if (actor === null) return [];
    const queue = createFieldQueue(actor);
    try {
      return (await queue.list()).filter((a) => a.state === 'queued');
    } finally {
      queue.close();
    }
  }, [actor]);

  // The checks and photos still queued on this phone (from before a reload).
  useEffect(() => {
    let live = true;
    void queued().then((actions) => {
      if (!live) return;
      const c = new Map<string, number>();
      const p = new Map<string, number>();
      for (const a of actions) {
        const task = taskIdOf(a.ops);
        if (a.projectId !== projectId || task === null) continue;
        if (a.kind === 'task_check') c.set(task, a.queuedAt);
        if (a.kind === 'task_photo') p.set(task, (p.get(task) ?? 0) + 1);
      }
      setChecked((old) => new Map([...c, ...old]));
      setPhotos((old) => {
        const next = new Map(p);
        for (const [k, n] of old) next.set(k, (next.get(k) ?? 0) + n);
        return next;
      });
    }, () => {});
    return () => {
      live = false;
    };
  }, [queued, projectId]);

  // EZD-2025: this project's refused task checks, read from the queue.
  const readRefused = useCallback(async () => {
    if (actor === null) return;
    const queue = createFieldQueue(actor);
    try {
      const next = new Map<string, FieldAction>();
      for (const a of await queue.list()) {
        const task = taskIdOf(a.ops);
        if (a.state === 'refused' && a.kind === 'task_check' && a.projectId === projectId && task !== null) {
          next.set(task, a);
        }
      }
      setRefused(next);
    } catch {
      /* the device database could not be read: the lines stay as they are */
    } finally {
      queue.close();
    }
  }, [actor, projectId]);

  useEffect(() => {
    queueMicrotask(() => void readRefused());
  }, [readRefused]);

  // After a send, store the pack again while online, so the stored copy carries the synced tasks. EZD-2025: and read
  // the refused checks again.
  useEffect(() => {
    if (sync === null) return;
    return sync.subscribe(() => {
      void readRefused();
      if (globalThis.navigator?.onLine === false) return;
      void fetchPack(packUrl, { credentials: 'same-origin' }).catch(() => {});
    });
  }, [sync, fetchPack, packUrl, readRefused]);

  const actions = useMemo<TaskActions | null>(() => {
    if (sync === null) return null;
    // Retry: the refused check goes back in the queue as it was, and is sent.
    const retry = async (taskId: string): Promise<CheckResult> => {
      const action = refused.get(taskId);
      if (action === undefined || actor === null) return 'failed';
      const queue = createFieldQueue(actor);
      try {
        await queue.requeue(action);
      } catch {
        return 'failed';
      } finally {
        queue.close();
      }
      setRefused((old) => {
        const next = new Map(old);
        next.delete(taskId);
        return next;
      });
      const at = Date.now();
      setChecked((old) => new Map(old).set(taskId, at));
      void sync.drain();
      return 'ok';
    };
    return {
      canCheck,
      canEdit,
      online,
      refused: new Set(refused.keys()),
      async check(taskId): Promise<CheckResult> {
        // A box ticked again after a refusal sends the refused check again, as Retry does (no second check).
        if (refused.has(taskId)) return retry(taskId);
        // Ticked only once the check is stored on the phone (storage full or private mode: not ticked).
        try {
          await sync.add({ projectId, kind: 'task_check', ops: { taskId, done: true } });
        } catch {
          return 'failed';
        }
        const at = Date.now();
        setChecked((old) => (old.has(taskId) ? old : new Map(old).set(taskId, at)));
        return 'ok';
      },
      retry,
      async addPhoto(taskId, file): Promise<PhotoResult> {
        const ext = photoExtOf(file.type);
        if (ext === null) return 'type';
        if (file.size > FIELD_PHOTO_MAX_BYTES) return 'size';
        try {
          await sync.add({ projectId, kind: 'task_photo', ops: { taskId }, photo: { blob: file, ext } });
        } catch {
          return 'failed';
        }
        setPhotos((old) => new Map(old).set(taskId, (old.get(taskId) ?? 0) + 1));
        return 'ok';
      },
      async edit(taskId, text) {
        try {
          const res = await fetch(
            `/api/projects/${encodeURIComponent(projectId)}/field-tasks/${encodeURIComponent(taskId)}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ text }),
            },
          );
          if (!res.ok) return false;
          const body = (await res.json()) as { textEn: string; textEs: string | null };
          setEdited((old) => new Map(old).set(taskId, { textEn: body.textEn, textEs: body.textEs }));
          void fetchPack(packUrl, { credentials: 'same-origin' }).catch(() => {});
          return true;
        } catch {
          return false;
        }
      },
    };
  }, [sync, canCheck, canEdit, online, projectId, fetchPack, packUrl, refused, actor]);

  const overlay = useMemo<TaskOverlay>(
    () => ({ checked: shownChecks(checked, new Set(refused.keys())), photos, edited, me: userName }),
    [checked, refused, photos, edited, userName],
  );
  // AC-EZD-2025-4: say why the controls are missing only to a member who holds one (S17 "No permission for an
  // action: that control is hidden").
  const senderFailed = sender.state === 'failed' && (canCheck || canPhoto || canEdit);

  return (
    <AsyncView
      load={load}
      skeleton={
        <PhoneFrame>
          <Skeleton height="44px" />
        </PhoneFrame>
      }
      errorMessage="field.pack.load_failed"
    >
      {(data) => (
        <FieldPackView
          data={fresh ?? data}
          language={language}
          canPhoto={canPhoto}
          overlay={overlay}
          taskActions={actions}
          senderFailed={senderFailed}
          icon={
            <OfflineStatusIcon
              cache={cache}
              projectId={projectId}
              queued={queued}
              sync={sync}
              labels="field"
            />
          }
        />
      )}
    </AsyncView>
  );
}
