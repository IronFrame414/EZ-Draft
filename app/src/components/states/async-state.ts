// State of one async load (vault/plans/EZD-015a.md Step 3). A result for an older run is ignored.
export type AsyncStatus = 'pending' | 'ready' | 'error';
export type AsyncState<T = unknown> = {
  status: AsyncStatus;
  run: number;
  data?: T;
  error?: unknown;
};
export type AsyncAction<T = unknown> =
  | { type: 'start'; run: number }
  | { type: 'resolve'; run: number; data: T }
  | { type: 'reject'; run: number; error: unknown };

export const INITIAL_ASYNC_STATE: AsyncState<never> = { status: 'pending', run: 0 };

export function asyncReducer<T>(state: AsyncState<T>, action: AsyncAction<T>): AsyncState<T> {
  switch (action.type) {
    case 'start':
      return { status: 'pending', run: action.run };
    case 'resolve':
      return action.run === state.run
        ? { status: 'ready', run: action.run, data: action.data }
        : state;
    case 'reject':
      return action.run === state.run
        ? { status: 'error', run: action.run, error: action.error }
        : state;
  }
}
