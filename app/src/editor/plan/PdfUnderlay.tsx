'use client';
// EZD-304 (S01 PDF: scale calibration "Required before tracing. Stored in source_file.scale_calibration"; 08 Imports
// "Underlay for tracing"; Q-0203 the scale can be added later): the editor reads the project's PDFs once the plan is
// up; when there is one, the pdf-underlay lazy module (pdf.js, the underlay, the no-scale banner and Set scale) loads
// and draws its part. A project with no PDF loads nothing more (11 Budgets editor download).
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { lazyModule } from '../../lib/lazy/lazy-module';
import type { ScaleCalibration } from '../../lib/imports/scale-calibration';
import type { UnderlayPdf } from '../../lazy/pdf-underlay';
import type { PlanController } from './controller';

const pdfModule = lazyModule(() => import('../../lazy/pdf-underlay'));

// The server answers only calibrations its schema passed (listProjectPdfs), so the plan checks the shape alone and
// keeps the schema out of the editor's download.
const calibrationIn = (v: unknown): ScaleCalibration | null =>
  v !== null && typeof v === 'object' && typeof (v as { lengthIn?: unknown }).lengthIn === 'number'
    ? (v as ScaleCalibration)
    : null;

async function newestPdf(projectId: string): Promise<UnderlayPdf | null> {
  const res = await fetch(`/api/projects/${projectId}/source-files`, {
    credentials: 'same-origin',
  });
  if (res.status !== 200) return null;
  const body = (await res.json()) as { pdfs?: Record<string, unknown>[] };
  const first = Array.isArray(body.pdfs) ? body.pdfs[0] : undefined;
  if (!first || typeof first.id !== 'string' || typeof first.originalName !== 'string') return null;
  return {
    id: first.id,
    originalName: first.originalName,
    scaleCalibration: calibrationIn(first.scaleCalibration),
  };
}

export function usePdfUnderlay(o: {
  projectId: string;
  plan: Pick<PlanController, 'setUnderlay'> | null;
  canEdit: boolean;
}): { part: ReactElement | null; refresh: () => void } {
  const { projectId, plan, canEdit } = o;
  const [pdf, setPdf] = useState<UnderlayPdf | null>(null);
  const [reads, setReads] = useState(0);
  const [mod, setMod] = useState(() => pdfModule.peek());
  const refresh = useCallback(() => setReads((n) => n + 1), []);

  useEffect(() => {
    if (plan === null) return;
    let live = true;
    newestPdf(projectId).then(
      (found) => {
        if (live) setPdf(found);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [projectId, plan, reads]);

  useEffect(() => {
    if (pdf === null || mod) return;
    let live = true;
    pdfModule.load().then(
      (m) => {
        if (live) setMod(m);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [pdf, mod]);

  const part =
    plan !== null && pdf !== null && mod ? (
      <mod.PdfUnderlayPart
        pdf={pdf}
        plan={plan}
        canEdit={canEdit}
        onSaved={(cal) => setPdf({ ...pdf, scaleCalibration: cal })}
      />
    ) : null;
  return { part, refresh };
}
