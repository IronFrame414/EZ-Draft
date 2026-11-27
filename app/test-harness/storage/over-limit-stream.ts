// EZD-2017 (flaky-test audit 2026-11-27 row 10): the body of an over-limit put, made as it is sent instead of held
// in memory, and stopped as soon as the server has answered. `sendUntilAnswered` wraps the request: when the answer
// comes back before the last byte has gone out, nothing more is made or sent.
export const STREAM_CHUNK_BYTES = 65536;

export type OverLimitBody = {
  stream: ReadableStream<Uint8Array>;
  // Bytes handed to the request so far.
  sent: () => number;
  // True once `stop` has been called or the request gave the stream up.
  stopped: () => boolean;
  // No byte is handed over after this.
  stop: () => void;
};

export function overLimitBody(
  totalBytes: number,
  opts: { fill?: number; delayMs?: number } = {},
): OverLimitBody {
  const chunk = new Uint8Array(STREAM_CHUNK_BYTES).fill(opts.fill ?? 0x61);
  const delayMs = opts.delayMs ?? 0;
  let sent = 0;
  let stopped = false;
  const stream = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        const left = totalBytes - sent;
        if (stopped || left <= 0) {
          controller.close();
          return;
        }
        const part = left >= chunk.length ? chunk : chunk.subarray(0, left);
        sent += part.length;
        controller.enqueue(part);
      },
      cancel() {
        stopped = true;
      },
    },
    // Nothing is made ahead of the request asking for it.
    { highWaterMark: 0 },
  );
  return {
    stream,
    sent: () => sent,
    stopped: () => stopped,
    stop: () => {
      stopped = true;
    },
  };
}

// Runs the request and stops the body the moment the request settles, whatever the answer was.
export async function sendUntilAnswered<T>(
  body: OverLimitBody,
  send: (stream: ReadableStream<Uint8Array>) => PromiseLike<T>,
): Promise<T> {
  try {
    return await send(body.stream);
  } finally {
    body.stop();
  }
}
