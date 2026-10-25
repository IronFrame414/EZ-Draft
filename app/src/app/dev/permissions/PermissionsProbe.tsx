'use client';
// EZD-102 Step 16 (vault/plans/EZD-102.md): shows the browser's permission set as values only, no interface
// text. Controls the member lacks are absent through Can (Q-0214; R24 "hidden"). perm-channel shows the user
// channel's status through its own hub handle (one channel per topic, ARCH Realtime Hub), so a browser test
// can wait for the subscription before changing a switch. Pattern: app/src/app/dev/realtime/RealtimeProbe.tsx.
import { useCallback, useRef, useSyncExternalStore } from 'react';
import { NoAccess } from '../../../components/states';
import { PERMISSION_KEYS, type PermissionKey } from '../../../lib/permissions/catalog';
import { Can, useCan } from '../../../lib/permissions/PermissionsProvider';
import { getRealtimeHub } from '../../../lib/realtime';
import type { ChannelStatus, UserHandle } from '../../../lib/realtime';

const CONTROLS: readonly PermissionKey[] = ['edit_model', 'delete_projects'];

// The user channel's status through the probe's own handle: taken when React subscribes (after mount),
// read at once, updated by onStatus, released on unmount (as useProjectChannel in lib/realtime/react.ts;
// the lint refuses a setState inside the effect body).
function useUserChannelStatus(): ChannelStatus {
  const handle = useRef<UserHandle | null>(null);
  const subscribe = useCallback((cb: () => void) => {
    const h = getRealtimeHub().user();
    handle.current = h;
    const off = h.onStatus(cb);
    cb();
    return () => {
      off();
      h.release();
      if (handle.current === h) handle.current = null;
    };
  }, []);
  const getSnapshot = useCallback(() => handle.current?.status ?? 'connecting', []);
  return useSyncExternalStore(subscribe, getSnapshot, () => 'connecting');
}

export function PermissionsProbe({
  projects,
}: {
  projects: { id: string; name: string }[] | null;
}) {
  const can = useCan();
  const status = useUserChannelStatus();

  return (
    <>
      <div data-testid="perm-controls">
        {CONTROLS.map((k) => (
          <Can key={k} permission={k}>
            <button type="button" data-testid={`perm-control-${k}`}>
              {k}
            </button>
          </Can>
        ))}
      </div>
      <output data-testid="perm-keys">
        {PERMISSION_KEYS.filter((k) => can(k))
          .sort()
          .join(',')}
      </output>
      {projects === null ? (
        <NoAccess />
      ) : (
        <ul data-testid="perm-projects">
          {projects.map((p) => (
            <li key={p.id} data-project-id={p.id}>
              <a href={`/dev/permissions/projects/${p.id}`}>{p.name}</a>
            </li>
          ))}
        </ul>
      )}
      <output data-testid="perm-channel" data-status={status}>
        {status}
      </output>
    </>
  );
}
