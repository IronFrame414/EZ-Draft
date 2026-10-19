import { createEmitter, type EventSink } from './emit';

// EZD-109 adds the event log sink, EZD-1301 the webhook sink.
export const defaultSinks: EventSink[] = [];

export const emit = createEmitter({ sinks: defaultSinks }).emit;

export { createEmitter, UnknownEventError } from './emit';
export type { EmitContext, EmittedEvent, EventSink } from './emit';
export { EVENTS, isRegisteredEvent } from '../../lib/events/registry';
export type { EventKind, EventName, EventPayloads } from '../../lib/events/registry';
