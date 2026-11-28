// EZD-2021 (audit 2026-11-27 X9; AC-EZD-2021-2): "Email me a code" answers after one minimum time, whether the
// address is a member (Auth sends an email) or a stranger (the hook refuses at once), so the answer's timing
// does not tell the two apart. The value is recorded in vault/build/assumptions/EZD-2021.md.
export const SIGN_IN_MIN_ANSWER_MS = 1500;

// Runs work and answers no sooner than minMs after the call began, for a result and for a throw alike. Work
// that takes longer answers as soon as it ends.
export async function answerAfter<T>(minMs: number, work: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await work();
  } finally {
    const left = minMs - (Date.now() - start);
    if (left > 0) await new Promise<void>((resolve) => setTimeout(resolve, left));
  }
}
