'use client';
// EZD-018 Step 6 (vault/plans/EZD-018.md): joins the project and user channels through the hub and shows
// values only (ids, statuses, JSON). No request of its own after load besides the hub's token fetch.
import { useEffect, useState } from 'react';
import { getRealtimeHub } from '../../../lib/realtime';
import type { ChannelStatus, PresenceMember } from '../../../lib/realtime';

type Received = { channel: 'project' | 'user'; event: string; payload: string };

export function RealtimeProbe({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<ChannelStatus>('connecting');
  const [userStatus, setUserStatus] = useState<ChannelStatus>('connecting');
  const [presence, setPresence] = useState<PresenceMember[]>([]);
  const [events, setEvents] = useState<Received[]>([]);
  const [resyncs, setResyncs] = useState(0);

  useEffect(() => {
    const hub = getRealtimeHub();
    const p = hub.project(projectId);
    const u = hub.user();
    const push = (channel: Received['channel'], event: string) => (payload: unknown) =>
      setEvents((list) => [...list, { channel, event, payload: JSON.stringify(payload) }]);
    const offs = [
      p.onStatus(setStatus),
      u.onStatus(setUserStatus),
      p.onPresence(() => setPresence(p.presence())),
      p.onResync(() => setResyncs((n) => n + 1)),
      p.on('dev.ping', push('project', 'dev.ping')),
      u.on('dev.ping', push('user', 'dev.ping')),
      u.on('session.ended', push('user', 'session.ended')),
    ];
    return () => {
      for (const off of offs) off();
      p.release();
      u.release();
    };
  }, [projectId]);

  return (
    <main>
      <p data-testid="rt-status">{status}</p>
      <p data-testid="rt-user-status">{userStatus}</p>
      <ul data-testid="rt-presence">
        {presence.map((m) => (
          <li key={m.appUserId} data-app-user-id={m.appUserId} />
        ))}
      </ul>
      <ul data-testid="rt-events">
        {events.map((e, i) => (
          <li key={i} data-channel={e.channel} data-event={e.event} data-payload={e.payload} />
        ))}
      </ul>
      <p data-testid="rt-resyncs">{resyncs}</p>
    </main>
  );
}
