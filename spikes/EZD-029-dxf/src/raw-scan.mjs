// EZD-029 raw scanner (vault/plans/EZD-029.md Step 2): counts the entity records of a text DXF by
// type, layer, space and block, with no parser, so "not read" = raw count - parsed count (R26 R16).
// Node built-ins only.

/** Records that belong to the POLYLINE or INSERT before them (Step 2). */
const SUB_RECORDS = new Set(['VERTEX', 'ATTRIB', 'SEQEND']);

const BINARY_SENTINEL = 'AutoCAD Binary DXF';

/** Header variables read from the HEADER section, with their value group code (Step 2). */
const HEADER_VARS = {
  $ACADVER: { key: 'acadVer', code: 1, int: false },
  $INSUNITS: { key: 'insUnits', code: 70, int: true },
  $DWGCODEPAGE: { key: 'dwgCodePage', code: 3, int: false },
};

/** @param {Record<string, number>} map @param {string} key */
function bump(map, key) {
  map[key] = (map[key] ?? 0) + 1;
}

/**
 * Splits a text DXF into group-code / value pairs. Codes are trimmed and parsed as integers; a
 * trailing `\r` is removed from each value, so CRLF and LF files give the same result (Step 2).
 * @param {string} text
 * @returns {Array<{ code: number, value: string }>}
 */
export function groupPairs(text) {
  const lines = text.split('\n');
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    const raw = lines[i + 1];
    pairs.push({ code, value: raw.endsWith('\r') ? raw.slice(0, -1) : raw });
  }
  return pairs;
}

/**
 * Decoding rule (Step 2, planner's choice): `AC1021` (R2007) and later are UTF-8, earlier versions
 * stay `latin1` (the usual ANSI_1252 code page).
 * @param {string | null} acadVer
 * @returns {'utf8' | 'latin1'}
 */
export function decodingFor(acadVer) {
  const m = /^AC(\d+)/.exec(acadVer ?? '');
  return m && Number(m[1]) >= 1021 ? 'utf8' : 'latin1';
}

/**
 * Finds `$ACADVER` in a file read as latin1 (safe for ASCII) and returns the decoding to use.
 * @param {string} latin1Text
 */
export function detectDecoding(latin1Text) {
  const m = /\$ACADVER[ \t]*\r?\n[ \t]*1[ \t]*\r?\n([^\r\n]*)/.exec(latin1Text);
  return decodingFor(m ? m[1].trim() : null);
}

/**
 * @param {string} text the DXF text (or a binary file read as latin1)
 */
export function rawScan(text) {
  if (text.startsWith(BINARY_SENTINEL)) return { binary: true };

  const pairs = groupPairs(text);
  /** @type {{ acadVer: string | null, insUnits: number | null, dwgCodePage: string | null }} */
  const header = { acadVer: null, insUnits: null, dwgCodePage: null };
  const entities = {
    total: 0,
    /** @type {Record<string, number>} */ byType: {},
    /** @type {Record<string, number>} */ byLayer: {},
    paperSpace: 0,
    /** @type {Record<string, number>} */ subRecords: {},
  };
  const blocks = {
    count: 0,
    entities: 0,
    /** @type {Record<string, number>} */ byBlock: {},
    /** @type {Record<string, number>} */ byType: {},
  };

  let section = null;
  let headerVar = null;
  // The ENTITIES record being read: its layer and space are counted when the next record starts.
  /** @type {{ layer: string, paper: boolean } | null} */
  let record = null;
  // BLOCKS: the definition being read, and whether the current record is its BLOCK record.
  /** @type {string | null} */
  let blockName = null;
  let inBlockRecord = false;
  let inBlock = false;

  const closeRecord = () => {
    if (record) {
      bump(entities.byLayer, record.layer);
      if (record.paper) entities.paperSpace++;
      record = null;
    }
  };

  for (let i = 0; i < pairs.length; i++) {
    const { code, value } = pairs[i];

    if (code === 0 && value === 'SECTION') {
      const next = pairs[i + 1];
      section = next && next.code === 2 ? next.value : null;
      i++;
      continue;
    }
    if (code === 0 && value === 'ENDSEC') {
      if (section === 'ENTITIES') closeRecord();
      section = null;
      continue;
    }
    if (code === 0 && value === 'EOF') break;

    if (section === 'HEADER') {
      if (code === 9) {
        headerVar = HEADER_VARS[/** @type {keyof typeof HEADER_VARS} */ (value)] ?? null;
      } else if (headerVar && code === headerVar.code) {
        header[headerVar.key] = headerVar.int ? parseInt(value.trim(), 10) : value;
        headerVar = null;
      }
    } else if (section === 'ENTITIES') {
      if (code === 0) {
        closeRecord();
        if (SUB_RECORDS.has(value)) {
          bump(entities.subRecords, value);
        } else {
          entities.total++;
          bump(entities.byType, value);
          record = { layer: '0', paper: false };
        }
      } else if (record && code === 8) {
        record.layer = value;
      } else if (record && code === 67) {
        record.paper = parseInt(value.trim(), 10) === 1;
      }
    } else if (section === 'BLOCKS') {
      if (code === 0) {
        inBlockRecord = false;
        if (value === 'BLOCK') {
          inBlock = true;
          inBlockRecord = true;
          blockName = null;
          blocks.count++;
        } else if (value === 'ENDBLK') {
          inBlock = false;
          blockName = null;
        } else if (inBlock && !SUB_RECORDS.has(value)) {
          blocks.entities++;
          bump(blocks.byType, value);
          if (blockName !== null) bump(blocks.byBlock, blockName);
        }
      } else if (inBlockRecord && code === 2) {
        blockName = value;
        blocks.byBlock[blockName] = blocks.byBlock[blockName] ?? 0;
      }
    }
  }
  closeRecord();

  return { binary: false, header, entities, blocks };
}
