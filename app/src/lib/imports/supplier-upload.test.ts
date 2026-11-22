// EZD-914 (S12 Upload "rendering images, PDF plans/elevations, DXF, order report"; Q-0513 order reports PDF only;
// Q-0517 each kind takes its own types). The first-tag rule is vault/build/assumptions.md EZD-914.
import { describe, expect, it } from 'vitest';
import {
  SUPPLIER_UPLOAD_ACCEPT,
  SUPPLIER_UPLOAD_KINDS,
  supplierAutoKind,
  supplierKindOptions,
} from './supplier-upload';

describe('EZD-914 supplier upload rules', () => {
  it('EZD-914 U2 the panel uploads renderings, PDF plans and elevations, DXF and order reports (S12 Upload)', () => {
    expect([...SUPPLIER_UPLOAD_KINDS].sort()).toEqual(['dxf', 'image', 'order_report', 'supplier_pdf']);
    expect(supplierAutoKind('2020_persp_02.png', 'image/png')).toBe('image');
    expect(supplierAutoKind('render.jpg', 'image/jpeg')).toBe('image');
    expect(supplierAutoKind('2020_elevations.dxf', 'image/vnd.dxf')).toBe('dxf');
    expect(supplierAutoKind('2020_order_report.pdf', 'application/pdf')).toBe('order_report');
    expect(supplierAutoKind('kitchen plan.pdf', 'application/pdf')).toBe('supplier_pdf');
    expect(supplierAutoKind('mesh.glb', 'model/gltf-binary')).toBeNull();
    // Q-0513: order reports PDF only, so an image or DXF can never be tagged one.
    expect(supplierKindOptions('application/pdf')).toEqual(['supplier_pdf', 'order_report']);
    expect(supplierKindOptions('image/png')).toEqual(['image']);
    expect(supplierKindOptions('image/vnd.dxf')).toEqual(['dxf']);
    // The picker lets a DWG and a 2020 file be chosen so they get their prompts.
    expect(SUPPLIER_UPLOAD_ACCEPT.split(',')).toEqual(
      expect.arrayContaining(['.dwg', '.kit', '.pdf', '.dxf', '.png', '.jpg']),
    );
  });
});
