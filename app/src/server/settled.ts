// Performance audit 2026-11-26: for server reads that start together (Promise.allSettled). A page takes each
// answer in the order it used to wait for them, so the first failure it meets is the one it met before the reads
// ran together (a missing project is still Not found even when a later read also failed).
export function valueOf<T>(result: PromiseSettledResult<T>): T {
  if (result.status === 'rejected') throw result.reason;
  return result.value;
}
