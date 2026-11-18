// EZD-305 (S02 Status bar source; board S02 "Polycam Space · DXF + GLB"): an import from a PDF drawing names its
// source "PDF" (wording for Josh to confirm, vault/build/assumptions.md EZD-305); a scan keeps the board's text.
import { describe, expect, it } from 'vitest';
import { sourceLine } from './review';

describe('EZD-305 review source line', () => {
  it('a PDF import reads PDF; a scan import is unchanged', () => {
    expect(sourceLine([{ name: 'plan.pdf', kind: 'pdf' }])).toBe('PDF');
    expect(sourceLine([{ name: 'scan.dxf', kind: 'polycam_dxf' }])).toBe('Polycam Space · DXF');
    expect(
      sourceLine([
        { name: 'scan.dxf', kind: 'polycam_dxf' },
        { name: 'plan.pdf', kind: 'pdf' },
      ]),
    ).toBe('Polycam Space · DXF');
  });
});
