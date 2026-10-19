import type { Message } from '../../../lib/messages/types';

export const en = {
  'dev.messages.sample': 'Sample message',
  'dev.messages.greeting': 'Hello, {name}',
  'dev.messages.items': { one: '{count} item', other: '{count} items' },
  'error.db_unavailable': "Can't reach the database. Try again in a minute.",
} as const satisfies Record<string, Message>;

export type MessageKey = keyof typeof en;
