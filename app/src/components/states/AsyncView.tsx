'use client';
// Skeleton while loading, inline error with Retry on failure (vault/plans/EZD-015a.md Step 3; S01 States).
import type { ReactNode } from 'react';
import type { MessageParams } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import { InlineError } from './InlineError';
import { useAsync } from './use-async';

export type AsyncViewProps<T> = {
  load: (signal: AbortSignal) => Promise<T>;
  skeleton: ReactNode;
  errorMessage: MessageKey;
  errorParams?: MessageParams;
  children: (data: T) => ReactNode;
};

export function AsyncView<T>({
  load,
  skeleton,
  errorMessage,
  errorParams,
  children,
}: AsyncViewProps<T>) {
  const { status, data, retry } = useAsync(load);
  if (status === 'pending') return <>{skeleton}</>;
  if (status === 'error') {
    return <InlineError message={errorMessage} params={errorParams} onRetry={retry} />;
  }
  return <>{children(data as T)}</>;
}
