// Runs a load in an effect and reports pending, ready or error (vault/plans/EZD-015a.md Step 3).
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { asyncReducer, INITIAL_ASYNC_STATE } from './async-state';
import type { AsyncState, AsyncStatus } from './async-state';

export type UseAsyncResult<T> = {
  status: AsyncStatus;
  data: T | undefined;
  error: unknown;
  retry: () => void;
};

export function useAsync<T>(load: (signal: AbortSignal) => Promise<T>): UseAsyncResult<T> {
  const [state, dispatch] = useReducer(asyncReducer<T>, INITIAL_ASYNC_STATE as AsyncState<T>);
  const runRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const start = useCallback(() => {
    controllerRef.current?.abort();
    const run = ++runRef.current;
    const c = new AbortController();
    controllerRef.current = c;
    dispatch({ type: 'start', run });
    load(c.signal).then(
      (data) => dispatch({ type: 'resolve', run, data }),
      (error) => dispatch({ type: 'reject', run, error }),
    );
  }, [load]);
  useEffect(() => {
    start();
    return () => controllerRef.current?.abort();
  }, [start]);
  return { status: state.status, data: state.data, error: state.error, retry: start };
}
