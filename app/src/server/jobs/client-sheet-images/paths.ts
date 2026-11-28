// EZD-2032 (AC-EZD-2032-1): where the client_sheet_images job writes a sent package's sheet images, and the shape of
// its result, shared by the job and the client page's sheets read (server/sends/client-sheets.ts). The exports bucket,
// <tenant>/<project>/client-sheets/<sent package>/<nn>.webp and <nn>-thumb.webp, nn the sheet's place in the set
// from 01. No imports, so a route reading it loads nothing of the job.

export type ClientSheetImage = {
  number: string;
  title: string;
  width: number;
  height: number;
  thumbWidth: number;
  thumbHeight: number;
};

export function clientSheetsDir(job: { tenant_id: string; project_id: string }, sentPackageId: string): string {
  return `${job.tenant_id}/${job.project_id}/client-sheets/${sentPackageId}`;
}

/** The two files of the sheet at `index` (from 0) in the set. */
export function clientSheetFiles(dir: string, index: number): { image: string; thumb: string } {
  const nn = String(index + 1).padStart(2, '0');
  return { image: `${dir}/${nn}.webp`, thumb: `${dir}/${nn}-thumb.webp` };
}
