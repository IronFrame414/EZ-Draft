// EZD-224 fixture THUMB_WEBP (vault/plans/EZD-224.md section 4): a lossless WebP, 440 x 256, 48 bytes,
// sha256 3a7b4999aa429365d8676a567616711b750e63d84f125dcbd602b9b8789decad (made with sharp 0.35.5, 2026-11-11).
// Test-only.
const BASE64 = 'UklGRigAAABXRUJQVlA4TBwAAAAvt8E/AAdQ+Lp3vv8BAUnS//9hRP8z/vOf/wcE';

export const THUMB_WEBP: Uint8Array<ArrayBuffer> = Uint8Array.from(Buffer.from(BASE64, 'base64'));
