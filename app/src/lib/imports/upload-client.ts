// EZD-301 (S01 Continue to review; 08 Imports "Originals are always stored unchanged"): sends each file of the
// Upload step to a project and starts the import. Per file: the app starts the source_file row and signs the
// upload, the browser sends the original bytes straight to Storage (uploadFile, EZD-132), and the app checks the
// object and stamps the row. Then import.started. Files already sent are recorded in `done`, so a retry after a
// failure sends only the rest. Browser only (fetch with the session cookie).
// EZD-306 (S01 DXF: conversion choice "After upload, DXF only"): once the files are sent, each DXF drawing (kind
// dxf) gets the conversion choice: its layers are read on the server and chooseLayers asks the user. The layers it
// answers go with the import (dxfLayers); an empty answer, or no chooseLayers, keeps the drawing as reference only.
// EZD-304 (S01 PDF: scale calibration "After upload, PDF only"; Q-0203 never blocks): once the files are sent, each
// PDF (kind pdf) gets the set-scale step through setScale, from its local bytes. Whatever it answers, or a failure,
// the import goes on; the scale can be set later.
import { uploadFile, type SignedUpload } from '../storage/upload';
import type { DxfLayerChoice } from './dxf-layers';
import type { UploadItem } from './upload-files';

export type UploadFailure = 'not_authorized' | 'upload_failed' | 'layers_failed' | 'import_failed';

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
  // EZD-307: called once the import has started, with the queued detection job (null when none was queued).
  onStarted?: (jobId: string | null) => void;
  // EZD-306: asks the conversion choice of one DXF drawing; answers the layers to convert ([] = reference only).
  chooseLayers?: (file: { name: string; layers: string[] }) => Promise<DxfLayerChoice[]>;
  // EZD-304: the set-scale step of one PDF; its answer never stops the import.
  setScale?: (file: { name: string; sourceFileId: string; source: Blob }) => Promise<unknown>;
};

/** EZD-307 (S02 Entry points): Import review of one import. */
export const importReviewPath = (projectId: string, jobId: string): string =>
  `/projects/${projectId}/import/${jobId}`;

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
  for (const item of items) {
    if (item.kind !== 'pdf' || !opts.setScale) continue;
    const sourceFileId = opts.done.get(item.id) as string;
    await opts.setScale({ name: item.name, sourceFileId, source: item.file }).catch(() => null);
  }
  const dxfLayers: { sourceFileId: string; layers: DxfLayerChoice[] }[] = [];
  for (const item of items) {
    if (item.kind !== 'dxf' || !opts.chooseLayers) continue;
    const sourceFileId = opts.done.get(item.id) as string;
    const layers = await readLayers(fetchImpl, projectId, sourceFileId, item.name);
    if (layers.length === 0) continue;
    const chosen = await opts.chooseLayers({ name: item.name, layers });
    if (chosen.length > 0) dxfLayers.push({ sourceFileId, layers: chosen });
  }
  let res: Response;
  try {
    res = await fetchImpl(
      `/api/projects/${projectId}/imports`,
      json(dxfLayers.length > 0 ? { sourceFileIds, dxfLayers } : { sourceFileIds }),
    );
  } catch {
    throw new ImportUploadError('import_failed', null);
  }
  if (res.status !== 202) throw new ImportUploadError('import_failed', null);
  if (opts.onStarted) {
    const body = (await res.json().catch(() => null)) as { jobId?: unknown } | null;
    opts.onStarted(typeof body?.jobId === 'string' ? body.jobId : null);
  }
  return sourceFileIds;
}

async function readLayers(
  fetchImpl: typeof fetch,
  projectId: string,
  sourceFileId: string,
  name: string,
): Promise<string[]> {
  try {
    const res = await fetchImpl(`/api/projects/${projectId}/source-files/${sourceFileId}/layers`, {
      credentials: 'same-origin',
    });
    if (res.status !== 200) throw new Error('layers');
    const body = (await res.json()) as { layers?: unknown };
    if (!Array.isArray(body.layers)) throw new Error('layers');
    return body.layers.filter((l): l is string => typeof l === 'string');
  } catch {
    throw new ImportUploadError('layers_failed', name);
  }
}
