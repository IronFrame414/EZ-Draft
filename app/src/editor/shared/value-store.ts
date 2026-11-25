// EZD-1906a (editor plan R4): one listener list and one simple value store for the editor, in place of the
// hand-written `listeners = new Set` stores. Multi-field stores stay on zustand.

/** A list of listeners. `notify` calls a copy of the list, so a listener may unsubscribe (or subscribe) while called. */
export type Listeners<A extends unknown[] = []> = {
  /** Adds a listener; the returned function removes it. */
  add(listener: (...args: A) => void): () => void;
  notify(...args: A): void;
  clear(): void;
};

export function createListeners<A extends unknown[] = []>(): Listeners<A> {
  const listeners = new Set<(...args: A) => void>();
  return {
    add(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    notify(...args) {
      for (const l of [...listeners]) l(...args);
    },
    clear: () => listeners.clear(),
  };
}

/** One value with its listeners. `set` notifies only when the value changes (by `equals`, `Object.is` by default). */
export type ValueStore<T> = {
  get(): T;
  set(next: T): void;
  subscribe(listener: () => void): () => void;
};

export function createValueStore<T>(
  initial: T,
  equals: (a: T, b: T) => boolean = Object.is,
): ValueStore<T> {
  let value = initial;
  const listeners = createListeners();
  return {
    get: () => value,
    set(next) {
      if (equals(value, next)) return;
      value = next;
      listeners.notify();
    },
    subscribe: listeners.add,
  };
}
