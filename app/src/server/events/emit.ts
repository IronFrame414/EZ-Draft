import { isRegisteredEvent, type EventName, type EventPayloads } from '../../lib/events/registry';

export interface EmitContext {
  tenantId: string;
  projectId?: string | null;
  actorId?: string | null;
}

export interface EmittedEvent<N extends EventName> {
  id: string;
  name: N;
  at: string;
  tenantId: string;
  projectId: string | null;
  actorId: string | null;
  payload: EventPayloads[N];
}

export type EventSink = (event: EmittedEvent<EventName>) => void | Promise<void>;

export class UnknownEventError extends Error {
  constructor(name: string) {
    super(`Unknown event name: ${name}`);
    this.name = 'UnknownEventError';
  }
}

export function createEmitter({
  sinks,
  now = () => new Date(),
  newId = () => crypto.randomUUID(),
}: {
  sinks: EventSink[];
  now?: () => Date;
  newId?: () => string;
}) {
  async function emit<N extends EventName>(
    name: N,
    payload: EventPayloads[N],
    ctx: EmitContext,
  ): Promise<EmittedEvent<N>> {
    if (!isRegisteredEvent(name)) {
      throw new UnknownEventError(String(name));
    }
    const event: EmittedEvent<N> = {
      id: newId(),
      name,
      at: now().toISOString(),
      tenantId: ctx.tenantId,
      projectId: ctx.projectId ?? null,
      actorId: ctx.actorId ?? null,
      payload,
    };
    const errors: unknown[] = [];
    for (const sink of sinks) {
      try {
        await sink(event);
      } catch (err) {
        errors.push(err);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, `${errors.length} event sink(s) failed for ${name}`);
    }
    return event;
  }
  return { emit };
}
