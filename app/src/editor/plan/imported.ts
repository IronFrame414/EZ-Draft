// EZD-313 (S02 Decisions "opens 03 Plan with a short notice of the counts imported"): the `imported` query Import
// review opens Plan with after Finish import, walls.windows.doors.rooms. Plain module, so the server page can
// read it (editor/plan/ImportedNotice.tsx shows it).
export type ImportedCounts = { walls: number; windows: number; doors: number; rooms: number };

const COUNTS = /^(\d{1,5})\.(\d{1,5})\.(\d{1,5})\.(\d{1,5})$/;

/** The query value for these counts. */
export const importedQuery = (c: ImportedCounts): string =>
  `${c.walls}.${c.windows}.${c.doors}.${c.rooms}`;

/** The counts in an `imported` query value, or null when it is not four whole numbers. */
export function parseImported(raw: unknown): ImportedCounts | null {
  if (typeof raw !== 'string') return null;
  const m = COUNTS.exec(raw);
  if (!m) return null;
  return { walls: Number(m[1]), windows: Number(m[2]), doors: Number(m[3]), rooms: Number(m[4]) };
}
