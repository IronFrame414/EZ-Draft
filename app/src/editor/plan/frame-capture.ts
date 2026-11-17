// EZD-224b Build step 5 (vault/plans/EZD-224b.md Decided "Frame capture", "WebGL read"; R-058; Q-0667): one
// pending read of the drawing buffer, run in the frame that drew it, and the compose of that buffer into the
// 440 x 256 thumbnail with `--ez-canvas` bands.
// Loaded by render-root.ts with import() on the first capture, so none of it is in the editor's first download
// (ARCH "Entry points and lazy modules"; the 500,000 byte editor budget).
import type { RootState } from '@react-three/fiber';
import {
  CAPTURE_TIMEOUT_MS,
  THUMB_HEIGHT,
  THUMB_WIDTH,
  thumbnailCrop,
  type CaptureSource,
  type ThumbnailCapture,
  type ThumbnailCrop,
} from '../../lib/thumbnail/thumbnail';
import { TOKENS } from '../../styles/tokens';

export type FrameCapture<T> = {
  request(read: () => T): Promise<T>;
  onFrame(): void;
  dispose(): void;
};

type Pending<T> = {
  promise: Promise<T>;
  read: () => T;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

export function createFrameCapture<T>(o: {
  invalidate: () => void;
  timeoutMs: number;
}): FrameCapture<T> {
  let pending: Pending<T> | null = null;
  let disposed = false;

  return {
    request(read) {
      if (disposed) return Promise.reject(new Error('plan.detached'));
      if (pending !== null) return pending.promise;
      let resolve!: (value: T) => void;
      let reject!: (error: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      const timer = setTimeout(() => {
        if (pending === null || pending.promise !== promise) return;
        pending = null;
        reject(new Error('plan.capture_timeout'));
      }, o.timeoutMs);
      pending = { promise, read, resolve, reject, timer };
      o.invalidate();
      return promise;
    },
    onFrame() {
      if (pending === null) return;
      const p = pending;
      clearTimeout(p.timer);
      pending = null;
      try {
        p.resolve(p.read());
      } catch (error) {
        p.reject(error);
      }
    },
    dispose() {
      disposed = true;
      if (pending === null) return;
      const p = pending;
      clearTimeout(p.timer);
      pending = null;
      p.reject(new Error('plan.detached'));
    },
  };
}

export type ThumbnailContext = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle'
  | 'fillRect'
  | 'imageSmoothingEnabled'
  | 'imageSmoothingQuality'
  | 'drawImage'
  | 'getImageData'
>;

export function drawThumbnail(
  ctx: ThumbnailContext,
  source: CanvasImageSource,
  crop: ThumbnailCrop,
  fill: string,
): ImageData {
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, crop.dx, crop.dy, crop.dw, crop.dh);
  return ctx.getImageData(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
}

// The WebGL read (Decided "WebGL read"): run inside `scene.onAfterRender`, in the task that drew the buffer.
export function readThumbnail(gl: RootState['gl'], source: CaptureSource): ThumbnailCapture {
  const crop = thumbnailCrop(source, gl.getPixelRatio());
  if (crop === null) throw new Error('plan.capture_region');
  const c = document.createElement('canvas');
  c.width = THUMB_WIDTH;
  c.height = THUMB_HEIGHT;
  const ctx = c.getContext('2d');
  if (ctx === null) throw new Error('plan.capture_2d');
  const fill = TOKENS.find((t) => t.name === '--ez-canvas')?.value;
  if (fill === undefined) throw new Error('unknown colour token --ez-canvas');
  return { image: drawThumbnail(ctx, gl.domElement, crop, fill), crop };
}

// The one frame capture a render root keeps (Decided "WebGL read"), with the 2,000 ms limit.
export function createThumbnailCapture(invalidate: () => void): FrameCapture<ThumbnailCapture> {
  return createFrameCapture<ThumbnailCapture>({ invalidate, timeoutMs: CAPTURE_TIMEOUT_MS });
}
