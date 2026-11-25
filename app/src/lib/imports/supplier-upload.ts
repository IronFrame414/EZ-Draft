// EZD-914 (S12 Upload; Q-0513, Q-0517): the Supplier files panel's file rules, kept apart from upload-files.ts so the
// plan editor's bundle (which loads upload-files for photos and letters) does not carry them (11 Budgets).
import type { SourceContentType, SourceFileKind } from '../storage/source-file-kinds';
import { checkFile, kindTakes, type IncomingFile, type Refusal } from './upload-files';

const DXF: SourceContentType = 'image/vnd.dxf';
const PDF: SourceContentType = 'application/pdf';
const PHOTO_TYPES: readonly SourceContentType[] = ['image/jpeg', 'image/png', 'image/heic'];

// S12 Upload "rendering images, PDF plans/elevations, DXF, order report": the kinds the Supplier files
// panel uploads, and the tag each content type takes first. A PDF is a supplier PDF unless its name says order or
// report (the user can correct it before sending); order reports are PDF only (Q-0513, Q-0517).
export const SUPPLIER_UPLOAD_KINDS = [
  'image',
  'supplier_pdf',
  'order_report',
  'dxf',
] as const satisfies readonly SourceFileKind[];

export type SupplierUploadKind = (typeof SUPPLIER_UPLOAD_KINDS)[number];

export function supplierKindOptions(contentType: SourceContentType): SupplierUploadKind[] {
  return SUPPLIER_UPLOAD_KINDS.filter((k) => kindTakes(k, contentType));
}

export function supplierAutoKind(name: string, contentType: SourceContentType): SupplierUploadKind | null {
  if (contentType === DXF) return 'dxf';
  if (contentType === PDF) return /order|report/i.test(name) ? 'order_report' : 'supplier_pdf';
  if ((PHOTO_TYPES as readonly string[]).includes(contentType)) return 'image';
  return null;
}

// The panel's picker: its own types, plus .dwg and the 2020 file so they can be picked and get their prompts.
export const SUPPLIER_UPLOAD_ACCEPT = '.jpg,.jpeg,.png,.heic,.pdf,.dxf,.dwg,.kit';

export type SupplierStaged<F = File> = {
  id: string;
  name: string;
  size: number;
  file: F;
  contentType: SourceContentType;
  kind: SupplierUploadKind;
};

// EZD-914: the files picked in the Supplier files panel, split into those ready to upload (with their first tag) and
// those refused with their prompt. A type the bucket takes but the panel does not (a GLB mesh) is unsupported here.
export function pickSupplierFiles<F>(
  incoming: readonly IncomingFile<F>[],
  newId: () => string,
): { staged: SupplierStaged<F>[]; refused: Refusal[] } {
  const staged: SupplierStaged<F>[] = [];
  const refused: Refusal[] = [];
  for (const f of incoming) {
    const check = checkFile(f.name, f.size);
    if (!check.ok) {
      refused.push({ name: f.name, reason: check.reason });
      continue;
    }
    const kind = supplierAutoKind(f.name, check.contentType);
    if (kind === null) {
      refused.push({ name: f.name, reason: 'unsupported' });
      continue;
    }
    staged.push({ id: newId(), name: f.name, size: f.size, file: f.file, contentType: check.contentType, kind });
  }
  return { staged, refused };
}
