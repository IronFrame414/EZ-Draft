// EZD-009 Step 8 (vault/plans/EZD-009.md): a fake clock for runner tests. `sleep` advances `now` at once,
// so a run that "waits" costs no real time. `{ now, sleep }` is the runner's clock shape (Step 5).
export type FakeClock = {
  now(): number;
  sleep(ms: number): Promise<void>;
};

export function createFakeClock(startMs = 0): FakeClock {
  let current = startMs;
  return {
    now: () => current,
    sleep: async (ms: number) => {
      current += ms;
    },
  };
}
