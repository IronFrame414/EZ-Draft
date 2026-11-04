'use client';
// EZD-132 Step 14 (vault/plans/EZD-132.md Decided Dev page; section 3 data-testid row): on a file pick, start
// the source file through the app, send the bytes straight to Storage with uploadFile, then complete and show
// the download link. Values only (status words, codes, numbers, ids, a URL), no interface text.
import { useState } from 'react';
import { uploadFile, UploadError, type SignedUpload } from '../../../lib/storage/upload';

type Status = 'idle' | 'uploading' | 'done' | 'failed';

// A route answer that is not 2xx: its JSON error.code, or http_<status> when that is missing.
class RouteError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

// A request to the app that throws (network) is fetch_failed; a non-2xx answer is a RouteError.
async function post(url: string, body?: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      ...(body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new RouteError('fetch_failed');
  }
  const json: unknown = await res.json().catch(() => null);
  if (res.status < 200 || res.status >= 300) {
    const code = (json as { error?: { code?: unknown } } | null)?.error?.code;
    throw new RouteError(typeof code === 'string' ? code : `http_${res.status}`);
  }
  if (json === null) throw new RouteError('fetch_failed');
  return json;
}

export function StorageProbe({ projectId, kind }: { projectId: string; kind: string }) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(0);
  const [sourceFileId, setSourceFileId] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');

  const onPick = async (file: File) => {
    setStatus('uploading');
    setError('');
    setSent(0);
    setSourceFileId('');
    setDownloadUrl('');
    let started: { sourceFile: { id: string }; upload: SignedUpload };
    try {
      started = (await post('/api/dev/storage', {
        projectId,
        kind,
        originalName: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      })) as { sourceFile: { id: string }; upload: SignedUpload };
    } catch (e) {
      setStatus('failed');
      setError(e instanceof RouteError ? e.code : 'fetch_failed');
      return;
    }
    setSourceFileId(started.sourceFile.id);
    try {
      await uploadFile(started.upload, file, {
        contentType: file.type || 'application/octet-stream',
        onProgress: (sentBytes) => setSent(sentBytes),
      });
    } catch (e) {
      setStatus('failed');
      setError(e instanceof UploadError ? e.code : 'fetch_failed');
      return;
    }
    try {
      const done = (await post(`/api/dev/storage/${started.sourceFile.id}/complete`)) as {
        downloadUrl: string;
      };
      setDownloadUrl(done.downloadUrl);
      setStatus('done');
    } catch (e) {
      setStatus('failed');
      setError(e instanceof RouteError ? e.code : 'fetch_failed');
    }
  };

  return (
    <div data-testid="storage-probe">
      <input
        type="file"
        data-testid="storage-file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onPick(file);
        }}
      />
      <p data-testid="storage-status">{status}</p>
      <p data-testid="storage-error">{error}</p>
      <p data-testid="storage-sent">{sent}</p>
      <p data-testid="storage-source-file-id">{sourceFileId}</p>
      <p data-testid="storage-download-url">{downloadUrl}</p>
    </div>
  );
}
