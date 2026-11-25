// EZD-418 (S04b Controls "Top schedule | Inspector footer | Opens schedule: material, thickness, area, edge length.
// Internal and client only; not on permit sheets"; 08 Exports "Countertop schedule | On sheets, CSV | Piece, material,
// thickness, area, edge profile, edge length"; R24 #5; AC-EZD-418-1; vault/build/assumptions.md EZD-418): the top
// schedule's cells as shown and as written to the CSV, one rule for both. Pure.
import { CM_PER_IN, countertopScheduleRows, type CountertopPieceData } from '@ezdraft/geometry';

const SQ_IN_PER_SQ_FT = 144;
const IN_PER_FT = 12;

// Half up at one decimal place, with a margin so float noise cannot drop an exact half (as the left panel's footer).
const oneDecimal = (n: number) => (Math.floor(n * 10 + 0.5 + 1e-9) / 10).toFixed(1);

export type TopScheduleText = {
  // Column headings, in order: piece, material, thickness, area (sq ft), edge profile, edge length (lf).
  headers: readonly [string, string, string, string, string, string];
  // An empty cell (no material, no profile).
  none: string;
  // The material's name; null when the item is not in the catalog read (or the catalog is not read).
  materialName: (itemId: string) => string | null;
  // Shown for a material whose name is not known.
  materialUnknown: string;
  // A profile's name; null when not known (the library comes with EZD-417).
  profileName: (profileId: string) => string | null;
  thicknessCm: (cm: string) => string;
};

export type TopScheduleLine = {
  label: string;
  cells: readonly [string, string, string, string, string, string];
};

export function topScheduleLines(
  pieces: readonly CountertopPieceData[],
  text: TopScheduleText,
): TopScheduleLine[] {
  return countertopScheduleRows(pieces).map((r) => {
    const profiles = r.profileIds.flatMap((id) => {
      const n = text.profileName(id);
      return n === null ? [] : [n];
    });
    return {
      label: r.label,
      cells: [
        r.name.length > 0 ? `${r.label} · ${r.name}` : r.label,
        r.materialItemId === null
          ? text.none
          : (text.materialName(r.materialItemId) ?? text.materialUnknown),
        text.thicknessCm(String(Math.round(r.thickness * CM_PER_IN * 10) / 10)),
        oneDecimal(r.areaSqIn / SQ_IN_PER_SQ_FT),
        profiles.length > 0 ? profiles.join(', ') : text.none,
        oneDecimal(r.edgeIn / IN_PER_FT),
      ],
    };
  });
}

// A spreadsheet reads a cell that starts with = + - @ (or a tab or return) as a formula; a leading ' keeps it text
// (as the cabinet schedule's CSV).
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(value: string): string {
  const s = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// The CSV (RFC 4180, CRLF line ends): the heading row, then one row per piece, the cells as the schedule shows them.
export function topScheduleCsv(lines: readonly TopScheduleLine[], headers: readonly string[]): string {
  const rows = [headers.map(csvCell).join(','), ...lines.map((l) => l.cells.map(csvCell).join(','))];
  return `${rows.join('\r\n')}\r\n`;
}
