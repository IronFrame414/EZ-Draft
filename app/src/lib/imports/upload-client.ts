// EZD-301 (S01 Continue to review; 08 Imports "Originals are always stored unchanged"): sends each file of the
// Upload step to a project and starts the import. Per file: the app starts the source_file row and signs the
// upload, the browser sends the original bytes straight to Storage (uploadFile, EZD-132), and the app checks the
// object and stamps the row. Then import.started. Files already sent are recorded in `done`, so a retry after a
// failure sends only the rest. Browser only (fetch with the session cookie).
import { uploadFile, type SignedUpload } from '../storage/upload';
import type { UploadItem } from './upload-files';

export type UploadFailure = 'not_authorized' | 'upload_failed' | 'import_failed';

export class ImportUploadError extends Error {
  readonly code: UploadFailure;
  readonly fileName: string | null;

  constructor(code: UploadFailure, fileName: string | null) {
    super(code);
    this.name = 'ImportUploadError';
    this.code = code;
    this.fileName = fileName;
  }
}

export type UploadRunOptions = {
  // Upload-step item id -> source_file id of the files already sent.
  done: Map<string, string>;
  onFile?: (index: number, total: number) => void;
  fetchImpl?: typeof fetch;
  retryDelaysMs?: readonly number[];
};

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'same-origin',
  body: JSON.stringify(body),
});

export async function uploadAndStartImport(
  projectId: string,
  items: readonly UploadItem<Blob>[],
  opts: UploadRunOptions,
): Promise<string[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  for (const [index, item] of items.entries()) {
    if (opts.done.has(item.id)) continue;
    opts.onFile?.(index, items.length);
    const failed = (code: UploadFailure = 'upload_failed') =>
      new ImportUploadError(code, item.name);
    let started: Response;
    try {
      started = await fetchImpl(
        `/api/projects/${projectId}/source-files`,
        json({
          kind: item.kind,
          originalName: item.name,
          contentType: item.contentType,
          size: item.size,
        }),
      );
    } catch {
      throw failed();
    }
    if (started.status === 403) throw failed('not_authorized');
    if (started.status !== 201) throw failed();
    const body = (await started.json()) as { sourceFile: { id: string }; upload: SignedUpload };
    try {
      await uploadFile(body.upload, item.file, {
        contentType: item.contentType,
        fetchImpl,
        ...(opts.retryDelaysMs !== undefined ? { retryDelaysMs: opts.retryDelaysMs } : {}),
      });
      const completed = await fetchImpl(`/api/source-files/${body.sourceFile.id}/complete`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (completed.status !== 200) throw failed();
    } catch {
      throw failed();
    }
    opts.done.set(item.id, body.sourceFile.id);
  }
  const sourceFileIds = items.map((i) => opts.done.get(i.id) as string);
  let res: Response;
  try {
    res = await fetchImpl(`/api/projects/${projectId}/imports`, json({ sourceFileIds }));
  } catch {
    throw new ImportUploadError('import_failed', null);
  }
  if (res.status !== 202) throw new ImportUploadError('import_failed', null);
  return sourceFileIds;
}
