// EZD-025 Step 8 (vault/plans/EZD-025.md): the stub bucket. An in-process node:http S3 server on 127.0.0.1
// (the EZD-021 net guard allows nothing else). Path style: /<bucket>/<key>. Memory only; every version of a
// key is kept. It accepts any signature and records every request.
//
//   const stub = await startStubS3({ versioning: 'Enabled', objectLock: {...}, bucket: 'ezd025-offsite' });
//   stub.endpoint, stub.bucket, stub.log              requests: { method, key, query, versionId, status }
//   stub.setVersioning('Enabled' | 'Suspended' | null)   null = never set
//   stub.setObjectLock(null | { mode, days })            null = not enabled
//   stub.versionsOf(key)     newest last: { versionId, deleteMarker, body, meta, contentType }
//   stub.currentKeys(prefix) keys whose newest entry is a version
//   stub.current(key)        { body, meta, contentType } or null
//   stub.requests(method)    log entries of one method
//   stub.stop()
//
// DeleteObject without versionId adds a delete marker. DeleteObject with versionId and POST ?delete answer 403
// and are recorded, so a forbidden call fails loudly in tests.
import { createHash, randomUUID } from 'node:crypto';
import http from 'node:http';

const xml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Decodes an aws-chunked body ("<hex size>[;sig]\r\n<data>\r\n ... 0\r\n"). */
function decodeAwsChunked(buf) {
  const parts = [];
  let i = 0;
  while (i < buf.length) {
    const eol = buf.indexOf('\r\n', i);
    if (eol < 0) break;
    const size = parseInt(buf.subarray(i, eol).toString('latin1').split(';')[0], 16);
    if (!Number.isFinite(size) || size === 0) break;
    parts.push(buf.subarray(eol + 2, eol + 2 + size));
    i = eol + 2 + size + 2;
  }
  return Buffer.concat(parts);
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

export async function startStubS3({
  bucket = 'ezd025-offsite',
  versioning = 'Enabled',
  objectLock = { mode: 'GOVERNANCE', days: 91 },
} = {}) {
  /** key -> array of entries, oldest first. */
  const store = new Map();
  const log = [];
  const state = { versioning, objectLock };
  // Strictly increasing, one second apart, across every version and delete marker (Entry.lastModified).
  let tick = 0;
  const stamp = () => new Date(Date.UTC(2026, 10, 1, 0, 0, 0) + ++tick * 1000);

  const entriesOf = (key) => store.get(key) ?? [];
  const newest = (key) => entriesOf(key).at(-1) ?? null;
  const currentKeys = (prefix = '') =>
    [...store.keys()].filter((k) => k.startsWith(prefix) && newest(k) && !newest(k).deleteMarker).sort();

  const send = (res, status, body = '', headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/xml', ...headers });
    res.end(body);
  };
  const errorXml = (res, status, code) =>
    send(res, status, `<?xml version="1.0"?><Error><Code>${code}</Code><Message>${code}</Message></Error>`);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const segments = url.pathname.slice(1).split('/');
    const bucketName = decodeURIComponent(segments[0] ?? '');
    const key = segments
      .slice(1)
      .map((s) => decodeURIComponent(s))
      .join('/');
    const entry = { method: req.method, key, query: url.search.replace(/^\?/, ''), versionId: url.searchParams.get('versionId'), status: 0 };
    log.push(entry);
    const done = (status, body, headers) => {
      entry.status = status;
      send(res, status, body, headers);
    };
    const fail = (status, code) => {
      entry.status = status;
      errorXml(res, status, code);
    };
    try {
      if (bucketName !== bucket) return fail(404, 'NoSuchBucket');
      const q = url.searchParams;

      // Bucket-level calls.
      if (key === '') {
        if (req.method === 'POST' && q.has('delete')) return fail(403, 'AccessDenied');
        if (req.method === 'GET' && q.has('versioning')) {
          const status = state.versioning ? `<Status>${state.versioning}</Status>` : '';
          return done(200, `<?xml version="1.0"?><VersioningConfiguration>${status}</VersioningConfiguration>`);
        }
        if (req.method === 'GET' && q.has('object-lock')) {
          if (!state.objectLock) return fail(404, 'ObjectLockConfigurationNotFoundError');
          return done(
            200,
            `<?xml version="1.0"?><ObjectLockConfiguration><ObjectLockEnabled>Enabled</ObjectLockEnabled><Rule><DefaultRetention><Mode>${state.objectLock.mode}</Mode><Days>${state.objectLock.days}</Days></DefaultRetention></Rule></ObjectLockConfiguration>`,
          );
        }
        if (req.method === 'GET' && q.has('versions')) {
          const prefix = q.get('prefix') ?? '';
          let out = `<?xml version="1.0"?><ListVersionsResult><Name>${bucket}</Name><Prefix>${xml(prefix)}</Prefix><IsTruncated>false</IsTruncated>`;
          for (const k of [...store.keys()].filter((x) => x.startsWith(prefix)).sort()) {
            const list = entriesOf(k);
            list.forEach((e, i) => {
              const latest = i === list.length - 1;
              out += e.deleteMarker
                ? `<DeleteMarker><Key>${xml(k)}</Key><VersionId>${e.versionId}</VersionId><IsLatest>${latest}</IsLatest><LastModified>${e.modified.toISOString()}</LastModified></DeleteMarker>`
                : `<Version><Key>${xml(k)}</Key><VersionId>${e.versionId}</VersionId><IsLatest>${latest}</IsLatest><LastModified>${e.modified.toISOString()}</LastModified><Size>${e.body.length}</Size><ETag>"${e.etag}"</ETag></Version>`;
            });
          }
          return done(200, `${out}</ListVersionsResult>`);
        }
        if (req.method === 'GET') {
          const prefix = q.get('prefix') ?? '';
          const max = Number(q.get('max-keys') ?? 1000);
          const after = q.get('continuation-token') ?? q.get('start-after') ?? '';
          const keys = currentKeys(prefix).filter((k) => k > after);
          const page = keys.slice(0, max);
          const truncated = keys.length > page.length;
          let out = `<?xml version="1.0"?><ListBucketResult><Name>${bucket}</Name><Prefix>${xml(prefix)}</Prefix><KeyCount>${page.length}</KeyCount><MaxKeys>${max}</MaxKeys><IsTruncated>${truncated}</IsTruncated>`;
          if (truncated) out += `<NextContinuationToken>${xml(page.at(-1))}</NextContinuationToken>`;
          for (const k of page) {
            const e = newest(k);
            out += `<Contents><Key>${xml(k)}</Key><LastModified>${e.modified.toISOString()}</LastModified><Size>${e.body.length}</Size><ETag>"${e.etag}"</ETag></Contents>`;
          }
          return done(200, `${out}</ListBucketResult>`);
        }
        return fail(405, 'MethodNotAllowed');
      }

      // Object-level calls.
      if (req.method === 'PUT') {
        let body = await readBody(req);
        const enc = String(req.headers['content-encoding'] ?? '');
        const sha = String(req.headers['x-amz-content-sha256'] ?? '');
        if (enc.includes('aws-chunked') || sha.startsWith('STREAMING-')) body = decodeAwsChunked(body);
        const meta = {};
        for (const [h, v] of Object.entries(req.headers)) {
          if (h.startsWith('x-amz-meta-')) meta[h.slice('x-amz-meta-'.length)] = String(v);
        }
        const versionId = randomUUID();
        const etag = createHash('md5').update(body).digest('hex');
        const list = state.versioning === 'Enabled' ? entriesOf(key) : [];
        list.push({
          versionId,
          deleteMarker: false,
          modified: stamp(),
          body,
          meta,
          etag,
          contentType: String(req.headers['content-type'] ?? 'application/octet-stream'),
        });
        store.set(key, list);
        return done(200, '', { etag: `"${etag}"`, 'x-amz-version-id': versionId });
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        const wanted = q.get('versionId');
        const list = entriesOf(key);
        const e = wanted ? list.find((x) => x.versionId === wanted) : newest(key);
        if (!e || e.deleteMarker) return fail(404, 'NoSuchKey');
        const headers = {
          'content-type': e.contentType,
          'content-length': String(e.body.length),
          etag: `"${e.etag}"`,
          'x-amz-version-id': e.versionId,
          'last-modified': e.modified.toUTCString(),
        };
        for (const [k, v] of Object.entries(e.meta)) headers[`x-amz-meta-${k}`] = v;
        entry.status = 200;
        res.writeHead(200, headers);
        res.end(req.method === 'HEAD' ? undefined : e.body);
        return undefined;
      }
      if (req.method === 'DELETE') {
        if (q.has('versionId')) return fail(403, 'AccessDenied');
        const versionId = randomUUID();
        const list = entriesOf(key);
        list.push({ versionId, deleteMarker: true, modified: stamp() });
        store.set(key, list);
        return done(204, '', { 'x-amz-delete-marker': 'true', 'x-amz-version-id': versionId });
      }
      return fail(405, 'MethodNotAllowed');
    } catch (err) {
      entry.status = 500;
      res.writeHead(500);
      res.end(String(err));
      return undefined;
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    endpoint: `http://127.0.0.1:${port}`,
    bucket,
    log,
    setVersioning: (v) => {
      state.versioning = v;
    },
    setObjectLock: (v) => {
      state.objectLock = v;
    },
    versionsOf: (key) => entriesOf(key).map((e) => ({ ...e })),
    currentKeys,
    current: (key) => {
      const e = newest(key);
      return e && !e.deleteMarker ? { body: e.body, meta: e.meta, contentType: e.contentType } : null;
    },
    requests: (method) => log.filter((e) => e.method === method),
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
