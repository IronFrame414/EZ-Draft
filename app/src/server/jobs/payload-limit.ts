// EZD-009 Step 5's job payload limit, in its own module so a route can check a payload before it emits anything
// (EZD-306: the DXF layer choice). enqueueJob refuses a larger payload.
export const MAX_PAYLOAD_BYTES = 16384;
