import { createEmitter, type EventSink } from './emit';
import { eventLogSink } from './event-log';

// EZD-109 event log sink; EZD-1301 adds the webhook sink.
export const defaultSinks: EventSink[] = [eventLogSink];

export const emit = createEmitter({ sinks: defaultSinks }).emit;

export { createEmitter, UnknownEventError } from './emit';
export type { EmitContext, EmittedEvent, EventSink } from './emit';
export { EVENTS, isRegisteredEvent } from '../../lib/events/registry';
export type { EventKind, EventName, EventPayloads } from '../../lib/events/registry';
export { EVENT_LOG, eventLogIp, eventLogSink } from './event-log';
export type { EventLogMode, EventLogObject, EventLogRule, EventObjectType } from './event-log';
