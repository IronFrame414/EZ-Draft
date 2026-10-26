// EZD-132 section 3 (vault/plans/EZD-132.md, test helper row): an in-memory TUS 1.0.0 server passed to
// uploadFile as `fetchImpl`, so the upload helper's unit tests reach no network (CLAUDE.md rule 6).
// POST answers 201 with Location `<request url>/upload-1`; PATCH appends at Upload-Offset (409 when it
// differs from the stored length) and answers 204 with the new length; HEAD answers 200 with the stored
// length. The options make one PATCH fail, answer a given status, or leave out Upload-Offset, and make every
// HEAD answer a given status. Every call is recorded in order, header names lower-cased.

export type FakeTusOptions = {
  failPatch?: { n: number; keepBytes: number };
  patchStatus?: { n: number; status: number };
  headStatus?: number;
  omitOffsetOnPatch?: number;
};

export type FakeTusRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyBytes: number;
};

export type FakeTus = {
  fetchImpl: typeof fetch;
  requests: FakeTusRequest[];
  stored(): Uint8Array;
  location: string;
};

export function createFakeTus(opts: FakeTusOptions = {}): FakeTus {
  const requests: FakeTusRequest[] = [];
  let data = new Uint8Array(0);
  let location = '';
  let patchN = 0;

  const append = (bytes: Uint8Array) => {
    const next = new Uint8Array(data.length + bytes.length);
    next.set(data, 0);
    next.set(bytes, data.length);
    data = next;
  };

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(input, init);
    const body = new Uint8Array(await req.arrayBuffer());
    const headers: Record<string, string> = {};
    req.headers.forEach((value, name) => {
      headers[name.toLowerCase()] = value;
    });
    const method = req.method.toUpperCase();
    requests.push({ method, url: req.url, headers, bodyBytes: body.length });

    if (method === 'POST') {
      location = `${req.url}/upload-1`;
      return new Response(null, {
        status: 201,
        headers: { Location: location, 'Tus-Resumable': '1.0.0' },
      });
    }

    if (method === 'HEAD') {
      if (opts.headStatus !== undefined) return new Response(null, { status: opts.headStatus });
      return new Response(null, {
        status: 200,
        headers: { 'Upload-Offset': String(data.length), 'Tus-Resumable': '1.0.0' },
      });
    }

    if (method === 'PATCH') {
      patchN += 1;
      if (opts.failPatch && opts.failPatch.n === patchN) {
        append(body.slice(0, opts.failPatch.keepBytes));
        throw new TypeError('fetch failed');
      }
      if (opts.patchStatus && opts.patchStatus.n === patchN) {
        return new Response(null, { status: opts.patchStatus.status });
      }
      if (opts.omitOffsetOnPatch === patchN) {
        return new Response(null, { status: 204, headers: { 'Tus-Resumable': '1.0.0' } });
      }
      const offset = Number(headers['upload-offset']);
      if (offset !== data.length) return new Response(null, { status: 409 });
      append(body);
      return new Response(null, {
        status: 204,
        headers: { 'Upload-Offset': String(data.length), 'Tus-Resumable': '1.0.0' },
      });
    }

    return new Response(null, { status: 405 });
  }) as typeof fetch;

  return {
    fetchImpl,
    requests,
    stored: () => data,
    get location() {
      return location;
    },
  };
}
