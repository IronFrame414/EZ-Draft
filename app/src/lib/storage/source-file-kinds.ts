// EZD-132 Step 5 (vault/plans/EZD-132.md): source file kinds, the same values and order as the source_file
// table's kind check (Step 1; 03c Tables source_file). Imported by browser and server.
export const SOURCE_FILE_KINDS = [
  'polycam_dxf',
  'polycam_glb',
  'pdf',
  'supplier_pdf',
  'dxf',
  'image',
  'order_report',
  'photo',
  'panel_photo',
  'field_measure',
] as const;

export type SourceFileKind = (typeof SOURCE_FILE_KINDS)[number];

// EZD-296 Step 2 (vault/plans/EZD-296.md): the file types and size the sources bucket takes; same values as
// supabase/migrations/20261103180000_set_sources_bucket_limits.sql (Q-0513 (a), Q-0514 (a)).
export const SOURCE_CONTENT_TYPES = [
  'image/vnd.dxf',
  'model/gltf-binary',
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
] as const;

export type SourceContentType = (typeof SOURCE_CONTENT_TYPES)[number];

export const SOURCE_MAX_BYTES = 52_428_800;
