// EZD-1997 (AC-EZD-1997-1; audit F6): the user channel for a property appraiser read. The Realtime library is
// downloaded only here, when a read needs the channel, so the New project dialog keeps it out of the Projects
// page's first load. While the download runs, setStop holds a cancel (an unmount or a newer read calls it);
// a cancelled open never takes a channel.
import type { UserHandle } from '../../lib/realtime/hub';

export type ReadChannel = Pick<UserHandle, 'on' | 'onResync' | 'ready' | 'release'>;

export async function openReadChannel(
  channel: (() => ReadChannel) | undefined,
  loadHub: () => Promise<{ user(): ReadChannel }>,
  setStop: (stop: (() => void) | null) => void,
): Promise<ReadChannel | 'failed' | 'cancelled'> {
  if (channel) return channel();
  let cancelled = false;
  setStop(() => {
    cancelled = true;
  });
  const hub = await loadHub().catch(() => null);
  if (cancelled) return 'cancelled';
  setStop(null);
  return hub ? hub.user() : 'failed';
}
