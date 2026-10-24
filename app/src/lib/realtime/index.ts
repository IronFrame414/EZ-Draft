// EZD-018 Step 5 (vault/plans/EZD-018.md): the per-tab hub bound to the real adapter, the token route and
// sign-in. Created lazily on first use in the browser, never during server rendering.
import { createOnlineSource } from '../network';
import { createSupabaseRealtimeAdapter, type RealtimeToken } from './adapter';
import { createRealtimeHub, type RealtimeHub } from './hub';

export { createRealtimeHub } from './hub';
export type {
  ChannelHandle,
  ChannelStatus,
  PresenceMember,
  ProjectHandle,
  RealtimeHub,
  UserHandle,
} from './hub';
export type { ProjectChannelEvents, UserChannelEvents } from './events';
export { toEventPayload } from './events';
export { parseTopic, projectTopic, userTopic } from './topics';

async function fetchToken(): Promise<RealtimeToken> {
  const res = await fetch('/api/realtime/token', { cache: 'no-store' });
  if (res.status !== 200) throw new Error('realtime_token_refused');
  return (await res.json()) as RealtimeToken;
}

let hub: RealtimeHub | null = null;

export function getRealtimeHub(): RealtimeHub {
  if (typeof window === 'undefined') throw new Error('realtime_hub_browser_only');
  if (!hub) {
    hub = createRealtimeHub({
      fetchToken,
      adapter: createSupabaseRealtimeAdapter(),
      env: { online: createOnlineSource() },
      onSessionEnded: () => window.location.assign('/sign-in'),
    });
  }
  return hub;
}
