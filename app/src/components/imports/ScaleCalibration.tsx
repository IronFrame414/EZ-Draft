'use client';

// EZD-304 (S01 PDF: scale calibration "After upload, PDF only"; Q-0203 a PDF with no known scale never blocks):
// useScaleCalibration gives the Upload step's hosts and the editor a setScale and the set-scale dialog to render
// while it waits. The dialog and pdf.js load together through lazyModule (11 Budgets; 11 Performance rule 7); a PDF
// pdf.js cannot open is passed over with no prompt.
import { useCallback, useRef, useState, type ReactElement } from 'react';
import { lazyModule } from '../../lib/lazy/lazy-module';
import type { ScaleCalibration } from '../../lib/imports/scale-calibration';
import type { PdfPage } from '../../lazy/pdf-underlay';

export const pdfModule = lazyModule(() => import('../../lazy/pdf-underlay'));

export type ScaleFile = { name: string; sourceFileId: string; source: Blob | string };

type Pending = {
  seq: number;
  mod: Awaited<ReturnType<typeof pdfModule.load>>;
  file: ScaleFile;
  page: PdfPage;
  resolve: (saved: ScaleCalibration | null) => void;
};

export function useScaleCalibration(opts: { fetchImpl?: typeof fetch } = {}): {
  setScale: (file: ScaleFile) => Promise<ScaleCalibration | null>;
  dialog: ReactElement | null;
} {
  const [pending, setPending] = useState<Pending | null>(null);
  const seq = useRef(0);
  const setScale = useCallback(async (file: ScaleFile): Promise<ScaleCalibration | null> => {
    let page: PdfPage;
    let mod: Pending['mod'];
    try {
      mod = await pdfModule.load();
      page = await mod.openPdfPage(file.source);
    } catch {
      // Q-0203: a PDF that cannot be read never blocks; it stays without a scale.
      return null;
    }
    return new Promise<ScaleCalibration | null>((resolve) => {
      seq.current += 1;
      setPending({ seq: seq.current, mod, file, page, resolve });
    });
  }, []);
  const Dialog = pending?.mod.ScaleCalibrationDialog;
  const dialog =
    pending && Dialog ? (
      <Dialog
        key={pending.seq}
        name={pending.file.name}
        sourceFileId={pending.file.sourceFileId}
        page={pending.page}
        {...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {})}
        onDone={(saved) => {
          setPending(null);
          void pending.page.close();
          pending.resolve(saved);
        }}
      />
    ) : null;
  return { setScale, dialog };
}
