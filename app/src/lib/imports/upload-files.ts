// EZD-301 (S01 Start from a file flow; 08 Imports; Q-0513, Q-0514, Q-0517): the Upload step's file list, shared by
// the browser and the server. A file's content type comes from its extension, never from the browser's File.type
// (browsers report DXF and GLB as empty or application/octet-stream), and must be one the sources bucket takes.
// A DWG is refused with the DXF prompt (Round 21; v1 accepts DXF only). Each kind takes only its own content types
// (Q-0517: order reports PDF only, field measure files the photo types). No React, no Supabase.
import {
  SOURCE_MAX_BYTES,
  type SourceContentType,
  type SourceFileKind,
} from '../storage/source-file-kinds';

const DXF: SourceContentType = 'image/vnd.dxf';
const GLB: SourceContentType = 'model/gltf-binary';
const PDF: SourceContentType = 'application/pdf';
const PHOTO_TYPES: readonly SourceContentType[] = ['image/jpeg', 'image/png', 'image/heic'];

// The content types each kind takes (Q-0513, Q-0517).
export const KIND_CONTENT_TYPES: Readonly<Record<SourceFileKind, readonly SourceContentType[]>> = {
  polycam_dxf: [DXF],
  dxf: [DXF],
  polycam_glb: [GLB],
  pdf: [PDF],
  supplier_pdf: [PDF],
  order_report: [PDF],
  image: PHOTO_TYPES,
  photo: PHOTO_TYPES,
  panel_photo: PHOTO_TYPES,
  field_measure: PHOTO_TYPES,
};

export function kindTakes(kind: SourceFileKind, contentType: string): boolean {
  return (KIND_CONTENT_TYPES[kind] as readonly string[]).includes(contentType);
}

// The tags the Upload step offers, in the spec's order (S01 File type tag per file).
export const UPLOAD_KINDS = [
  'polycam_dxf',
  'polycam_glb',
  'pdf',
  'supplier_pdf',
  'dxf',
  'order_report',
  'photo',
  'image',
] as const satisfies readonly SourceFileKind[];

export type UploadKind = (typeof UPLOAD_KINDS)[number];

const EXTENSION_TYPES: Readonly<Record<string, SourceContentType>> = {
  dxf: DXF,
  glb: GLB,
  pdf: PDF,
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
};

export type RefusalReason = 'dwg' | 'unsupported' | 'too_large' | 'empty';

export type FileCheck =
  { ok: true; contentType: SourceContentType } | { ok: false; reason: RefusalReason };

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function isDwg(name: string): boolean {
  return extensionOf(name) === 'dwg';
}

export function checkFile(name: string, size: number): FileCheck {
  if (isDwg(name)) return { ok: false, reason: 'dwg' };
  const contentType = EXTENSION_TYPES[extensionOf(name)];
  if (contentType === undefined) return { ok: false, reason: 'unsupported' };
  if (size <= 0) return { ok: false, reason: 'empty' };
  if (size > SOURCE_MAX_BYTES) return { ok: false, reason: 'too_large' };
  return { ok: true, contentType };
}

// The tags a file of this content type may carry.
export function kindOptions(contentType: SourceContentType): UploadKind[] {
  return UPLOAD_KINDS.filter((k) => kindTakes(k, contentType));
}

// The file input sources of wizard step 2 (board S01b column 2; Q-0189; Q-0398: only built sources show).
export const FILE_SOURCES = ['polycam', 'pdf', 'dxf', 'supplier_pdf'] as const;
export type FileSource = (typeof FILE_SOURCES)[number];

// Auto-detected tag (S01 File type tag per file), led by the chosen source: a DXF is a Polycam floor plan when the
// source is Polycam scan or a GLB mesh is in the list (Polycam exports the two together), else a supplier or
// architect drawing; a PDF is a supplier kitchen PDF under that source, else a plan PDF; images are supplier
// renderings (S01 Supplier rendering images). The user can correct any tag.
export function autoKind(
  contentType: SourceContentType,
  source: FileSource,
  batchHasMesh: boolean,
): UploadKind {
  if (contentType === DXF) return source === 'polycam' || batchHasMesh ? 'polycam_dxf' : 'dxf';
  if (contentType === GLB) return 'polycam_glb';
  if (contentType === PDF) return source === 'supplier_pdf' ? 'supplier_pdf' : 'pdf';
  return 'image';
}

// The source a dropped set of files suggests: a mesh means a Polycam scan, else a DXF means a DXF drawing,
// else a PDF.
export function sourceForFiles(names: readonly string[]): FileSource {
  const exts = names.map(extensionOf);
  if (exts.includes('glb')) return 'polycam';
  if (exts.includes('dxf')) return 'dxf';
  return 'pdf';
}

export type UploadItem<F = File> = {
  id: string;
  name: string;
  size: number;
  file: F;
  contentType: SourceContentType;
  kind: UploadKind;
  kindEdited: boolean;
};

export type Refusal = { name: string; reason: RefusalReason };

export type UploadList<F = File> = {
  source: FileSource;
  items: UploadItem<F>[];
  refused: Refusal[];
};

export function emptyUploadList<F = File>(source: FileSource): UploadList<F> {
  return { source, items: [], refused: [] };
}

export type IncomingFile<F = File> = { name: string; size: number; file: F };

// Tags not corrected by the user follow the batch: adding or removing the mesh re-tags the DXFs.
function retag<F>(source: FileSource, items: UploadItem<F>[]): UploadItem<F>[] {
  const hasMesh = items.some((i) => i.contentType === GLB);
  return items.map((i) =>
    i.kindEdited ? i : { ...i, kind: autoKind(i.contentType, source, hasMesh) },
  );
}

// A new source re-tags the files the user has not corrected.
export function setSource<F>(list: UploadList<F>, source: FileSource): UploadList<F> {
  return { ...list, source, items: retag(source, list.items) };
}

// Adds the files that pass checkFile; the refused ones replace the previous refusals.
export function addFiles<F>(
  list: UploadList<F>,
  incoming: readonly IncomingFile<F>[],
  newId: () => string,
): UploadList<F> {
  const items = [...list.items];
  const refused: Refusal[] = [];
  for (const f of incoming) {
    const check = checkFile(f.name, f.size);
    if (!check.ok) {
      refused.push({ name: f.name, reason: check.reason });
      continue;
    }
    items.push({
      id: newId(),
      name: f.name,
      size: f.size,
      file: f.file,
      contentType: check.contentType,
      kind: autoKind(check.contentType, list.source, false),
      kindEdited: false,
    });
  }
  return { source: list.source, items: retag(list.source, items), refused };
}

export function removeFile<F>(list: UploadList<F>, id: string): UploadList<F> {
  return {
    source: list.source,
    items: retag(
      list.source,
      list.items.filter((i) => i.id !== id),
    ),
    refused: [],
  };
}

export function setKind<F>(list: UploadList<F>, id: string, kind: UploadKind): UploadList<F> {
  return {
    ...list,
    items: list.items.map((i) =>
      i.id === id && kindTakes(kind, i.contentType) ? { ...i, kind, kindEdited: true } : i,
    ),
  };
}

// The file input's accept list: the extensions above plus .dwg, so a DWG can be picked and get its prompt.
export const UPLOAD_ACCEPT = '.dxf,.dwg,.glb,.pdf,.jpg,.jpeg,.png,.heic';
