// EZD-901a (R26 R16 "unsupported entity types are counted"; docs/architecture.md ### DXF (EZD-029) "Counting
// method"): EZD-029's raw scanner (spikes/EZD-029-dxf/src/raw-scan.mjs), which counts the entity records of a text
// DXF by type with no parser, so not read = raw count - parsed count, for ENTITIES and BLOCKS together. VERTEX,
// ATTRIB and SEQEND are sub-records of the record before them and are counted apart.

const SUB_RECORDS = new Set(['VERTEX', 'ATTRIB', 'SEQEND']);

export type RawScan = {
  // Entity records in ENTITIES and inside BLOCKS definitions, by type.
  byType: Record<string, number>;
  subRecords: Record<string, number>;
};

const bump = (map: Record<string, number>, key: string) => {
  map[key] = (map[key] ?? 0) + 1;
};

// Group-code / value pairs; a trailing \r is removed, so CRLF and LF files give the same result.
export function rawScan(text: string): RawScan {
  const lines = text.split('\n');
  const out: RawScan = { byType: {}, subRecords: {} };
  let section: string | null = null;
  let inBlock = false;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (code !== 0) continue;
    const raw = lines[i + 1];
    const value = (raw.endsWith('\r') ? raw.slice(0, -1) : raw).trim();
    if (value === 'SECTION') {
      const name = lines[i + 3];
      section = parseInt(lines[i + 2]?.trim() ?? '', 10) === 2 && name !== undefined ? name.trim() : null;
      i += 2;
      continue;
    }
    if (value === 'ENDSEC') {
      section = null;
      inBlock = false;
      continue;
    }
    if (value === 'EOF') break;
    if (section === 'ENTITIES') {
      if (SUB_RECORDS.has(value)) bump(out.subRecords, value);
      else bump(out.byType, value);
    } else if (section === 'BLOCKS') {
      if (value === 'BLOCK') inBlock = true;
      else if (value === 'ENDBLK') inBlock = false;
      else if (inBlock) {
        if (SUB_RECORDS.has(value)) bump(out.subRecords, value);
        else bump(out.byType, value);
      }
    }
  }
  return out;
}
