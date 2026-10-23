// EZD-021 Step 3: a 2 x 2 px RGB PNG, made once with Node's zlib and committed as a literal. Test data only.
export const STUB_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAAMIM/////w8AH+4F+7C4l8kAAAAASUVORK5CYII=';

export const STUB_PNG = new Uint8Array(Buffer.from(STUB_PNG_B64, 'base64'));
