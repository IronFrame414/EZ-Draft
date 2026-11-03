// EZD-295 T5 (vault/plans/EZD-295.md section 4; AC-EZD-295-1). Expected values: Decided D4 (`readLogoBody`: a null
// body is ok with 0 bytes; once the total passes LOGO_MAX_BYTES it cancels the reader and answers
// `logo_too_large`) and Q-0512 (a) (4,000,000 bytes).
import { describe, expect, it, vi } from 'vitest';
import { readLogoBody } from './company';

function streamOf(chunks: Uint8Array[]) {
  const cancel = vi.fn();
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else controller.close();
    },
    cancel,
  });
  return { stream, cancel };
}
const chunk = (i: number) => new Uint8Array(1_000_000).fill(i + 1);

describe('EZD-295 logo body', () => {
  it('T5 readLogoBody: 4,000,000 bytes read whole, one byte more cancels the source, null is empty', async () => {
    const four = [0, 1, 2, 3].map(chunk);
    const ok = streamOf(four);
    const r1 = await readLogoBody(ok.stream);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.bytes.length).toBe(4_000_000);
    const joined = new Uint8Array(4_000_000);
    four.forEach((c, i) => joined.set(c, i * 1_000_000));
    expect(Buffer.from(r1.bytes).equals(Buffer.from(joined))).toBe(true);

    const big = streamOf([...four, new Uint8Array(1)]);
    expect(await readLogoBody(big.stream)).toEqual({ ok: false, code: 'logo_too_large' });
    expect(big.cancel).toHaveBeenCalledTimes(1);

    const none = await readLogoBody(null);
    expect(none.ok).toBe(true);
    if (none.ok) expect(none.bytes.length).toBe(0);
  });
});
