// EZD-914 (AC-EZD-914-1 "A proprietary 2020 file shows the prompt for DXF, 3D export and order report"; S12 Upload "DWG
// prompts for DXF"; States Error). Rendered in the real office catalog, English. The prompt wording is for Josh to
// confirm (vault/build/assumptions.md EZD-914); the test checks it names the three things S12 asks for.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { pickSupplierFiles } from '../../lib/imports/supplier-upload';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { elements, textOf } from '../../../test-harness/projects-markup';
import {
  receivedDate,
  SupplierFileSummary,
  SupplierFilesPanel,
  SupplierRefusals,
} from './SupplierFilesPanel';

const render = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {ui}
    </MessagesProvider>,
  );

const file = (name: string, size = 2048) => ({ name, size, file: name });
let n = 0;
const nextId = () => `f${++n}`;

describe('EZD-914 Supplier files panel', () => {
  it('EZD-914 C1 a proprietary 2020 file shows the prompt for DXF, 3D export and order report (AC-EZD-914-1)', () => {
    const picked = pickSupplierFiles([file('Hendricks kitchen.kit')], nextId);
    expect(picked.staged).toEqual([]);
    const html = render(<SupplierRefusals refused={picked.refused} />);
    const messages = elements(html, 'supplier-refused-message');
    expect(messages).toHaveLength(1);
    const text = textOf(messages[0].inner);
    expect(text).toContain('2020');
    expect(text).toContain('DXF');
    expect(text).toContain('3D export');
    expect(text).toContain('order report');
    expect(html).toContain('data-reason="proprietary_2020"');
    expect(html).toContain('Hendricks kitchen.kit');
  });

  it('EZD-914 C2 a DWG shows the DXF prompt; renderings, PDFs, DXF and order reports are ready to upload', () => {
    const picked = pickSupplierFiles(
      [
        file('plan.dwg'),
        file('2020_persp_02.png'),
        file('2020_order_report.pdf'),
        file('kitchen.pdf'),
        file('2020_elevations.dxf'),
        file('scan.glb'),
      ],
      nextId,
    );
    expect(picked.staged.map((s) => [s.name, s.kind])).toEqual([
      ['2020_persp_02.png', 'image'],
      ['2020_order_report.pdf', 'order_report'],
      ['kitchen.pdf', 'supplier_pdf'],
      ['2020_elevations.dxf', 'dxf'],
    ]);
    const html = render(<SupplierRefusals refused={picked.refused} />);
    expect(elements(html, 'supplier-refused-message').map((m) => textOf(m.inner).replaceAll('&#x27;', "'"))).toEqual([
      'Save this drawing as DXF and upload the DXF',
      "This file can't be used here. Use JPG, PNG, HEIC, PDF or DXF.",
    ]);
  });

  it('EZD-914 C3 the panel header shows Supplier files with Upload only for Upload references (board S12)', () => {
    const withUpload = render(<SupplierFilesPanel projectId="p" canUpload />);
    expect(withUpload).toContain('Supplier files');
    expect(elements(withUpload, 'supplier-upload')).toHaveLength(1);
    expect(withUpload).toContain('.kit');
    expect(withUpload).toContain('.dwg');
    const viewOnly = render(<SupplierFilesPanel projectId="p" canUpload={false} />);
    expect(elements(viewOnly, 'supplier-upload')).toHaveLength(0);
    expect(elements(viewOnly, 'supplier-files-loading')).toHaveLength(1);
  });

  it('EZD-914 C4 the received date reads as on the board (10/08/26)', () => {
    expect(receivedDate('2026-10-08T12:00:00')).toBe('10/08/26');
  });

  // EZD-916 (S12 File row "22 lines read"; vault/build/assumptions.md EZD-916 AC-1 numbers).
  it('EZD-916 an order report row reads its confirmed lines once read, else its type and size', () => {
    const summary = (f: Parameters<typeof SupplierFileSummary>[0]['file']) =>
      textOf(elements(render(<SupplierFileSummary file={f} />), 'supplier-file-summary')[0].inner);
    expect(summary({ kind: 'order_report', sizeBytes: 2_097_152, linesRead: 22 })).toBe(
      'Order report · 22 lines read',
    );
    expect(summary({ kind: 'order_report', sizeBytes: 2_097_152, linesRead: 0 })).toBe('Order report · 2.0 MB');
    expect(summary({ kind: 'supplier_pdf', sizeBytes: 1_048_576, linesRead: null })).toBe('Supplier PDF · 1.0 MB');
  });
});
