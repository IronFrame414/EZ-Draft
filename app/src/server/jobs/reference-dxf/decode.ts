// EZD-901a (docs/architecture.md ### DXF (EZD-029) "Decoding rule ... Other code pages are EZD-901a's"): the one
// decoding rule for DXF bytes, used by the import reader (polycam-dxf/read-dxf.ts) and the reference conversion.
// - A file starting "AutoCAD Binary DXF" is binary and not read (binary_dxf).
// - $ACADVER AC1021 (R2007) and later are UTF-8 (DXF Reference, HEADER).
// - Earlier files use $DWGCODEPAGE: ANSI_<n> is Windows code page n (ANSI_1252 is windows-1252, whose 0x80-0x9F
//   hold the en dash and curly quotes that latin1 lacks; ANSI_932 Shift JIS; 936 GBK; 949 EUC-KR; 950 Big5).
// - A file with no code page, or one this runtime cannot decode, is read as windows-1252, AutoCAD's default
//   (vault/build/assumptions.md EZD-901a).

export class DxfDecodeError extends Error {
  constructor(readonly code: 'binary_dxf') {
    super(code);
    this.name = 'DxfDecodeError';
  }
}

const ANSI_LABELS: Record<string, string> = {
  '874': 'windows-874',
  '932': 'shift_jis',
  '936': 'gbk',
  '949': 'euc-kr',
  '950': 'big5',
};

// The TextDecoder label for a $DWGCODEPAGE value, or null when it names no code page this rule knows.
export function codePageLabel(dwgCodePage: string | null): string | null {
  const m = /^ANSI_(\d+)$/i.exec((dwgCodePage ?? '').trim());
  if (!m) return null;
  if (/^125\d$/.test(m[1])) return `windows-${m[1]}`;
  return ANSI_LABELS[m[1]] ?? null;
}

function decoderFor(label: string): TextDecoder | null {
  try {
    return new TextDecoder(label);
  } catch {
    return null;
  }
}

export function decodeDxfBytes(bytes: Uint8Array): string {
  // ASCII-safe first read to find the header values.
  const latin = Buffer.from(bytes).toString('latin1');
  if (latin.startsWith('AutoCAD Binary DXF')) throw new DxfDecodeError('binary_dxf');
  const ver = /\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*AC(\d{4})/.exec(latin);
  if (ver && Number(ver[1]) >= 1021) return new TextDecoder('utf-8').decode(bytes);
  const page = /\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n([^\r\n]*)/.exec(latin);
  const label = codePageLabel(page ? page[1] : null) ?? 'windows-1252';
  const decoder = decoderFor(label) ?? decoderFor('windows-1252')!;
  return decoder.decode(bytes);
}
