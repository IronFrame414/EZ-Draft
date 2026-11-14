// EZD-301 (AC-EZD-301-1; S01 Start from a file flow: DWG upload, File type tag per file, Remove file). A DWG shows
// "Save this drawing as DXF and upload the DXF" (S01 text). Rendered in the real office catalog, English.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { addFiles, emptyUploadList } from '../../lib/imports/upload-files';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { elements, textOf } from '../../../test-harness/projects-markup';
import { UploadStep } from './UploadStep';

const render = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {ui}
    </MessagesProvider>,
  );

const file = (name: string, size: number) => ({ name, size, file: new File([], name) });
let n = 0;
const nextId = () => `f${++n}`;

describe('EZD-301 Upload step', () => {
  it('EZD-301 C1 a DWG shows the prompt and is not listed (AC-EZD-301-1)', () => {
    const list = addFiles(emptyUploadList('dxf'), [file('kitchen.dwg', 2048)], nextId);
    const html = render(<UploadStep list={list} onChange={() => {}} />);
    const messages = elements(html, 'upload-refused-message');
    expect(messages).toHaveLength(1);
    expect(textOf(messages[0].inner)).toBe('Save this drawing as DXF and upload the DXF');
    expect(elements(html, 'upload-file')).toHaveLength(0);
    expect(elements(html, 'upload-files-empty')).toHaveLength(1);
  });

  it('EZD-301 C2 each file shows its tag choices and a Remove button', () => {
    const list = addFiles(
      emptyUploadList('polycam'),
      [file('scan.dxf', 1_048_576), file('scan.glb', 3_145_728)],
      nextId,
    );
    const html = render(<UploadStep list={list} onChange={() => {}} />);
    const rows = elements(html, 'upload-file');
    expect(rows).toHaveLength(2);
    expect(html).toContain('data-kind="polycam_dxf"');
    expect(html).toContain('data-kind="polycam_glb"');
    expect(elements(html, 'upload-file-remove')).toHaveLength(2);
    expect(elements(html, 'upload-file-name').map((e) => textOf(e.inner))).toEqual([
      'scan.dxf',
      'scan.glb',
    ]);
    const tags = elements(html, 'upload-file-tag');
    expect(textOf(tags[0].inner)).toContain('Polycam floor plan (DXF)');
    expect(textOf(tags[0].inner)).toContain('DXF drawing');
    expect(textOf(tags[1].inner)).toBe('Polycam mesh (GLB)');
    expect(elements(html, 'upload-refused')).toHaveLength(0);
    expect(elements(html, 'upload-input')).toHaveLength(1);
    expect(html).toContain('accept=".dxf,.dwg,.glb,.pdf,.jpg,.jpeg,.png,.heic"');
  });
});
