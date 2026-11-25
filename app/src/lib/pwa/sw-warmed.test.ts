// EZD-1401 (S17 Offline status icon "spinner while caching"): after the warm work the worker answers the page that
// sent it, so the icon checks the cache again without a timer; the generated worker wires it.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { WARM_MESSAGE, replyWarmed } from './sw-rules.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('EZD-1401 warm reply', () => {
  it('posts the warm type with done to the sending page; no page or a closed one is no error', () => {
    const source = { postMessage: vi.fn() };
    replyWarmed(source);
    expect(source.postMessage).toHaveBeenCalledWith({ type: WARM_MESSAGE, done: true });
    expect(() => replyWarmed(null)).not.toThrow();
    expect(() =>
      replyWarmed({
        postMessage: () => {
          throw new Error('gone');
        },
      }),
    ).not.toThrow();
  });

  it('the worker replies after the warm work and ignores its own reply type', () => {
    const src = readFileSync(path.join(here, '..', '..', '..', 'public', 'sw.js'), 'utf8');
    expect(src).toContain('onWarmMessage(event.data).then(() => replyWarmed(event.source))');
    expect(src).toContain('!event.data.done');
  });
});
