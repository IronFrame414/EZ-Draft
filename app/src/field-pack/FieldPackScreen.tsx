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
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { useFieldSync, useOutboxActor } from '../components/outbox/OutboxDrain';
import { PhoneFrame } from '../components/phone/PhoneFrame';
import { Skeleton } from '../components/states/Skeleton';
import { AsyncView } from '../components/states/AsyncView';
import { OfflineStatusIcon } from '../components/phone/OfflineStatusIcon';
import { useOnline } from '../lib/network';
import type { Language } from '../lib/messages/types';
import { FIELD_PHOTO_MAX_BYTES, photoExtOf } from '../lib/outbox/field-action';
import { createFieldQueue } from '../lib/outbox/field-queue';
import { createProjectCache } from '../lib/pwa/project-cache';
import type { FieldPackView as PackData } from './types';
import { FieldPackView } from './FieldPackView';
import type { TaskOverlay } from './tasks-view';
import type { PhotoResult, TaskActions } from './TasksPanel';

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
  const sync = useFieldSync();
  const online = useOnline();
  const [checked, setChecked] = useState<ReadonlyMap<string, number>>(new Map());
  const [photos, setPhotos] = useState<ReadonlyMap<string, number>>(new Map());
  const [edited, setEdited] = useState<TaskOverlay['edited']>(new Map());
  // EZD-2002: the pack that landed after the stored pack answered.
  const [fresh, setFresh] = useState<PackData | null>(null);

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

  // After a send, store the pack again while online, so the stored copy carries the synced tasks.
  useEffect(() => {
    if (sync === null) return;
    return sync.subscribe(() => {
      if (globalThis.navigator?.onLine === false) return;
      void fetchPack(packUrl, { credentials: 'same-origin' }).catch(() => {});
    });
  }, [sync, fetchPack, packUrl]);

  const actions = useMemo<TaskActions | null>(() => {
    if (sync === null) return null;
    return {
      canCheck,
      canEdit,
      online,
      check(taskId) {
        const at = Date.now();
        setChecked((old) => (old.has(taskId) ? old : new Map(old).set(taskId, at)));
        void sync.add({ projectId, kind: 'task_check', ops: { taskId, done: true } });
      },
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
  }, [sync, canCheck, canEdit, online, projectId, fetchPack, packUrl]);

  const overlay = useMemo<TaskOverlay>(
    () => ({ checked, photos, edited, me: userName }),
    [checked, photos, edited, userName],
  );

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
