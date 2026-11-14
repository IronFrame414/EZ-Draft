// EZD-301 (AC-EZD-301-1; S01 Start from a file flow; 08 Imports; Q-0513, Q-0514, Q-0517). Expected values: the DWG
// prompt and the tag names are S01's text; the size cap is Q-0514 (52,428,800 bytes); the content types per kind
// are Q-0513 and Q-0517; the bucket's types are EZD-296's list.
import { describe, expect, it } from 'vitest';
import { SOURCE_FILE_KINDS } from '../storage/source-file-kinds';
import {
  addFiles,
  autoKind,
  checkFile,
  emptyUploadList,
  isDwg,
  KIND_CONTENT_TYPES,
  kindOptions,
  kindTakes,
  removeFile,
  setKind,
  setSource,
  sourceForFiles,
  UPLOAD_KINDS,
} from './upload-files';

let n = 0;
const nextId = () => `id-${++n}`;
const f = (name: string, size = 10) => ({ name, size, file: name });

describe('EZD-301 upload files', () => {
  it('EZD-301 U1 a DWG is refused with the dwg reason, in any letter case (AC-EZD-301-1)', () => {
    expect(isDwg('kitchen.dwg')).toBe(true);
    expect(isDwg('KITCHEN.DWG')).toBe(true);
    expect(isDwg('kitchen.dxf')).toBe(false);
    expect(checkFile('kitchen.dwg', 1000)).toEqual({ ok: false, reason: 'dwg' });
    expect(checkFile('Plan.DWG', 0)).toEqual({ ok: false, reason: 'dwg' });
    const list = addFiles(emptyUploadList<string>('dxf'), [f('plan.dwg')], nextId);
    expect(list.items).toEqual([]);
    expect(list.refused).toEqual([{ name: 'plan.dwg', reason: 'dwg' }]);
  });

  it('EZD-301 U2 content type comes from the extension and must be one the bucket takes', () => {
    expect(checkFile('scan.dxf', 5)).toEqual({ ok: true, contentType: 'image/vnd.dxf' });
    expect(checkFile('mesh.GLB', 5)).toEqual({ ok: true, contentType: 'model/gltf-binary' });
    expect(checkFile('plan.pdf', 5)).toEqual({ ok: true, contentType: 'application/pdf' });
    expect(checkFile('a.jpg', 5)).toEqual({ ok: true, contentType: 'image/jpeg' });
    expect(checkFile('a.jpeg', 5)).toEqual({ ok: true, contentType: 'image/jpeg' });
    expect(checkFile('a.png', 5)).toEqual({ ok: true, contentType: 'image/png' });
    expect(checkFile('a.heic', 5)).toEqual({ ok: true, contentType: 'image/heic' });
    expect(checkFile('mesh.gltf', 5)).toEqual({ ok: false, reason: 'unsupported' });
    expect(checkFile('order.csv', 5)).toEqual({ ok: false, reason: 'unsupported' });
    expect(checkFile('noext', 5)).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('EZD-301 U3 size: empty refused, 52,428,800 bytes taken, one more refused (Q-0514)', () => {
    expect(checkFile('a.pdf', 0)).toEqual({ ok: false, reason: 'empty' });
    expect(checkFile('a.pdf', 52_428_800)).toEqual({ ok: true, contentType: 'application/pdf' });
    expect(checkFile('a.pdf', 52_428_801)).toEqual({ ok: false, reason: 'too_large' });
  });

  it('EZD-301 U4 each kind takes only its own content types (Q-0517, Q-0513)', () => {
    expect(kindTakes('order_report', 'application/pdf')).toBe(true);
    expect(kindTakes('order_report', 'image/png')).toBe(false);
    for (const t of ['image/jpeg', 'image/png', 'image/heic']) {
      expect(kindTakes('field_measure', t), t).toBe(true);
      expect(kindTakes('photo', t), t).toBe(true);
    }
    expect(kindTakes('field_measure', 'application/pdf')).toBe(false);
    expect(kindTakes('polycam_dxf', 'image/vnd.dxf')).toBe(true);
    expect(kindTakes('polycam_dxf', 'application/pdf')).toBe(false);
    expect(kindTakes('polycam_glb', 'model/gltf-binary')).toBe(true);
    expect(kindTakes('dxf', 'model/gltf-binary')).toBe(false);
    expect(kindTakes('supplier_pdf', 'image/vnd.dxf')).toBe(false);
    expect(Object.keys(KIND_CONTENT_TYPES).sort()).toEqual([...SOURCE_FILE_KINDS].sort());
  });

  it('EZD-301 U5 the tag list is S01 File type tag per file, offered only where the type fits', () => {
    expect(UPLOAD_KINDS).toEqual([
      'polycam_dxf',
      'polycam_glb',
      'pdf',
      'supplier_pdf',
      'dxf',
      'order_report',
      'photo',
      'image',
    ]);
    expect(kindOptions('image/vnd.dxf')).toEqual(['polycam_dxf', 'dxf']);
    expect(kindOptions('application/pdf')).toEqual(['pdf', 'supplier_pdf', 'order_report']);
    expect(kindOptions('model/gltf-binary')).toEqual(['polycam_glb']);
    expect(kindOptions('image/png')).toEqual(['photo', 'image']);
  });

  it('EZD-301 U6 auto tag follows the source and the mesh; images are supplier renderings', () => {
    expect(autoKind('image/vnd.dxf', 'polycam', false)).toBe('polycam_dxf');
    expect(autoKind('image/vnd.dxf', 'dxf', false)).toBe('dxf');
    expect(autoKind('image/vnd.dxf', 'dxf', true)).toBe('polycam_dxf');
    expect(autoKind('model/gltf-binary', 'pdf', false)).toBe('polycam_glb');
    expect(autoKind('application/pdf', 'pdf', false)).toBe('pdf');
    expect(autoKind('application/pdf', 'supplier_pdf', false)).toBe('supplier_pdf');
    expect(autoKind('image/jpeg', 'polycam', false)).toBe('image');
    expect(sourceForFiles(['scan.dxf', 'scan.glb'])).toBe('polycam');
    expect(sourceForFiles(['a.DXF'])).toBe('dxf');
    expect(sourceForFiles(['a.pdf'])).toBe('pdf');
  });

  it('EZD-301 U7 add, correct a tag, remove; uncorrected tags follow the mesh and the source', () => {
    let list = addFiles(emptyUploadList<string>('dxf'), [f('floor.dxf')], nextId);
    expect(list.items.map((i) => i.kind)).toEqual(['dxf']);
    list = addFiles(list, [f('mesh.glb'), f('ref.dwg')], nextId);
    expect(list.items.map((i) => i.kind)).toEqual(['polycam_dxf', 'polycam_glb']);
    expect(list.refused).toEqual([{ name: 'ref.dwg', reason: 'dwg' }]);

    const glb = list.items[1];
    list = removeFile(list, glb.id);
    expect(list.items.map((i) => i.kind)).toEqual(['dxf']);
    expect(list.refused).toEqual([]);

    const dxf = list.items[0];
    list = setKind(list, dxf.id, 'order_report');
    expect(list.items[0].kind).toBe('dxf');
    list = setKind(list, dxf.id, 'polycam_dxf');
    expect(list.items[0]).toMatchObject({ kind: 'polycam_dxf', kindEdited: true });
    list = setSource(list, 'dxf');
    expect(list.items[0].kind).toBe('polycam_dxf');

    let pdfs = addFiles(emptyUploadList<string>('pdf'), [f('kitchen.pdf')], nextId);
    pdfs = setSource(pdfs, 'supplier_pdf');
    expect(pdfs.items[0].kind).toBe('supplier_pdf');
    expect(pdfs.items[0].file).toBe('kitchen.pdf');
    expect(pdfs.items[0].size).toBe(10);
  });
});
