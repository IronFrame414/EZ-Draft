// EZD-020 Step 3 (vault/plans/EZD-020.md): load a lazy module on first use (11 Performance rule 7).
// One promise stays in flight; a rejected load clears it so the next load() tries again (EZD-015's Retry).

export type LazyModule<T> = {
  load(): Promise<T>;
  preload(): void;
  peek(): T | undefined;
};

export function lazyModule<T>(load: () => Promise<T>): LazyModule<T> {
  let inFlight: Promise<T> | undefined;
  let value: T | undefined;

  const start = (): Promise<T> => {
    if (!inFlight) {
      inFlight = load().then(
        (v) => {
          value = v;
          return v;
        },
        (e: unknown) => {
          inFlight = undefined;
          throw e;
        },
      );
    }
    return inFlight;
  };

  return {
    load: start,
    preload() {
      start().catch(() => {});
    },
    peek: () => value,
  };
}
