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
