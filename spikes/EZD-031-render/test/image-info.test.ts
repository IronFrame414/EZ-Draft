// EZD-031 test T9 (vault/plans/EZD-031.md Tests; Interface contract src/image-info.ts).
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { imageInfo } from '../src/image-info';
import { fixture } from './helpers';

describe('EZD-031 image header reader', () => {
  it('T9 reads PNG IHDR, JPEG SOF0 and refuses other bytes', () => {
    expect(imageInfo(fs.readFileSync(fixture('stub-room.png')))).toEqual({ type: 'png', width: 2, height: 2 });
    expect(imageInfo(fs.readFileSync(fixture('sof0-1024x768.jpg')))).toEqual({ type: 'jpeg', width: 1024, height: 768 });
    expect(imageInfo(Uint8Array.from({ length: 16 }, (_, i) => (i * 37 + 11) % 256))).toBeNull();
  });
});
