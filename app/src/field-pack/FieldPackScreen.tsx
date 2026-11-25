'use client';
// EZD-1404 (S17 States "First load: downloads and caches the pack; offline icon shows progress"; "Offline: fully
// usable after first load"; "Error: ... failure with Retry"; AC-EZD-1404-2 "With the network off the seeded pack
// opens"): loads /api/projects/<id>/field-pack through the project cache (lib/pwa/project-cache.ts), which stores
// the answer on this phone and answers from that copy with no network; the service worker keeps the page itself
// (sw-rules.mjs warmPageCopy). The offline icon reads that cache and this project's queued field actions.
import { useCallback, useMemo, type ReactElement } from 'react';
import { useFieldSync, useOutboxActor } from '../components/outbox/OutboxDrain';
import { PhoneFrame } from '../components/phone/PhoneFrame';
import { Skeleton } from '../components/states/Skeleton';
import { AsyncView } from '../components/states/AsyncView';
import { OfflineStatusIcon } from '../components/phone/OfflineStatusIcon';
import type { Language } from '../lib/messages/types';
import { createFieldQueue } from '../lib/outbox/field-queue';
import { createProjectCache } from '../lib/pwa/project-cache';
import type { FieldPackView as PackData } from './types';
import { FieldPackView } from './FieldPackView';

export function FieldPackScreen({
  projectId,
  language,
  canPhoto,
}: {
  projectId: string;
  language: Language;
  canPhoto: boolean;
}): ReactElement {
  const cache = useMemo(() => createProjectCache(), [projectId]);
  const actor = useOutboxActor();
  const sync = useFieldSync();

  const load = useCallback(
    async (signal: AbortSignal): Promise<PackData> => {
      const fetchPack = cache.wrap(globalThis.fetch.bind(globalThis));
      const res = await fetchPack(`/api/projects/${projectId}/field-pack`, {
        signal,
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`field pack ${res.status}`);
      return (await res.json()) as PackData;
    },
    [cache, projectId],
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
          data={data}
          language={language}
          canPhoto={canPhoto}
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
