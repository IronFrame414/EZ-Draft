// EZD-220 (Q-0704 05-screens "A failed photo upload keeps the pin and shows a retry state"; AC-EZD-220-4): the photo
// upload of each pin, kept while the editor is open so a pin selected again still shows its Retry. Keyed by
// lower-cased pin id. No React.
import type { SourceContentType } from '../../lib/storage/source-file-kinds';
import type { PhotoAttempt } from './pin-photo';
import { idKey } from '../shared/ids';

export type PinUploadState =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'failed'; code: 'not_authorized' | 'upload_failed' }
  | { kind: 'refused'; reason: 'not_photo' | 'too_large' | 'empty' };

export type PinUpload = {
  state: PinUploadState;
  attempt: { current: PhotoAttempt };
  file: { name: string; blob: Blob; contentType: SourceContentType } | null;
};

const uploads = new Map<string, PinUpload>();

export function pinUploadOf(pinId: string): PinUpload {
  const key = idKey(pinId);
  let p = uploads.get(key);
  if (p === undefined) {
    p = { state: { kind: 'idle' }, attempt: { current: null }, file: null };
    uploads.set(key, p);
  }
  return p;
}
