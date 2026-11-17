// EZD-224b Build step 4 (vault/plans/EZD-224b.md Decided "Encoder", "Worker", "Worker scope type"; 11 rule 3):
// the one-shot thumbnail worker. One request `{ image }`, one reply through encodeReply; an encoded reply
// transfers its bytes.
import encode from '@jsquash/webp/encode';
import { encodeReply, type ThumbnailWorkerScope } from '../lib/thumbnail/thumbnail';
const scope = self as unknown as ThumbnailWorkerScope;
scope.onmessage = (event) => {
  void encodeReply(event.data.image, (image, quality) => encode(image, { quality })).then((reply) =>
    scope.postMessage(reply, reply.kind === 'encoded' ? [reply.bytes] : []),
  );
};
