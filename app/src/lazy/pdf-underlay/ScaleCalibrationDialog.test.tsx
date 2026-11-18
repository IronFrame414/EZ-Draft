// EZD-304 (S01 PDF: scale calibration "Click two points on the page, type the real distance"; Q-0203 never blocks, so
// the step can be skipped; Q-0760 built from the written spec). Radix is mocked as in EZD-306's DXF dialog test so
// the dialog renders in place, in the real office catalog, English. The page is a stand-in for the pdf.js page (the
// fixture's 1224 x 792 pt sheet, fixtures/synthetic/room-12x10-vector.pdf.expected.json `view`). Expected: the title
// names the file, the first hint asks for the first point, the distance field is empty, Skip for now is offered and
// Save scale is disabled until two points and a distance are set. Clicking and saving run in e2e/pdf-scale.spec.ts.
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('radix-ui', async () => {
  const React = await import('react');
  type P = Record<string, unknown> & { children?: ReactNode };
  const part = (tag: string) => {
    const Part = (props: P) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(props)) {
        if (k === 'className' || k === 'lang' || k.startsWith('data-')) out[k] = v;
      }
      return React.createElement(tag, out, props.children);
    };
    return Part;
  };
  const pass = (props: P) => React.createElement(React.Fragment, null, props.children);
  return {
    Dialog: {
      Root: pass,
      Portal: pass,
      Overlay: part('div'),
      Content: part('div'),
      Title: part('h2'),
      Description: part('p'),
    },
  };
});

import { elements, textOf } from '../../../test-harness/projects-markup';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import type { PdfPage } from './pdf-page';
import { ScaleCalibrationDialog } from './ScaleCalibrationDialog';

const page: PdfPage = {
  pageNumber: 1,
  widthPt: 1224,
  heightPt: 792,
  draw: async () => {},
  toPdf: (_s, x, y) => [x, y],
  toImage: (_s, p) => ({ x: p[0], y: p[1] }),
  close: async () => {},
};

const render = () =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <ScaleCalibrationDialog name="plan.pdf" sourceFileId="f" page={page} onDone={() => {}} />
    </MessagesProvider>,
  );

const tag = (html: string, name: string, testId: string) =>
  new RegExp(`<${name}[^>]*data-testid="${testId}"[^>]*>`).exec(html)?.[0] ?? '';

describe('EZD-304 set-scale dialog', () => {
  it('names the file, asks for the first point and offers Skip for now', () => {
    const html = render();
    const dialog = textOf(elements(html, 'pdf-scale')[0].inner);
    expect(dialog).toContain('Set the scale of plan.pdf');
    expect(dialog).toContain(
      'Click two points on the page, then type the real distance between them.',
    );
    expect(textOf(elements(html, 'pdf-scale-hint')[0].inner)).toBe('Click the first point.');
    expect(textOf(elements(html, 'pdf-scale-skip')[0].inner)).toBe('Skip for now');
    expect(textOf(elements(html, 'pdf-scale-save')[0].inner)).toBe('Save scale');
    expect(tag(html, 'button', 'pdf-scale-save')).toContain('disabled');
    expect(tag(html, 'button', 'pdf-scale-skip')).not.toContain('disabled');
    expect(tag(html, 'input', 'pdf-scale-distance')).toContain('value=""');
    expect(tag(html, 'canvas', 'pdf-scale-page')).toContain('data-width-pt="1224"');
    expect(html).not.toContain('data-testid="pdf-scale-point"');
  });
});
