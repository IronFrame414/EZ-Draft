'use client';
// EZD-304 (S01 PDF: scale calibration "Required before tracing"; 08 Imports "Underlay for tracing"; Q-0203 "a banner;
// the scale can be added later"): the plan's part for the project's newest PDF, loaded with pdf.js only when the
// project has one (11 Budgets). With a scale, page 1 is drawn under the plan for every viewer; without one, a person
// who may edit sees a banner whose Set scale opens the set-scale step on the stored original. A PDF that cannot be
// read or drawn shows nothing more (the plan works as before).
import { useEffect, useState, type ReactElement } from 'react';
import { Icon } from '../../components/icon/Icon';
import { StateButton } from '../../components/states/StateButton';
import banner from '../../components/states/banner.module.css';
import type { ScaleCalibration, UnderlayQuad } from '../../lib/imports/scale-calibration';
import { useT } from '../../lib/messages';
import { drawUnderlay, openPdfPage, type PdfPage } from './pdf-page';
import { ScaleCalibrationDialog } from './ScaleCalibrationDialog';

export type UnderlayPdf = {
  id: string;
  originalName: string;
  scaleCalibration: ScaleCalibration | null;
};

export type PdfUnderlayPartProps = {
  pdf: UnderlayPdf;
  plan: {
    setUnderlay(u: { image: HTMLCanvasElement; corners: UnderlayQuad['corners'] } | null): void;
  };
  canEdit: boolean;
  onSaved: (cal: ScaleCalibration) => void;
};

async function linkOf(sourceFileId: string): Promise<string> {
  const res = await fetch(`/api/source-files/${sourceFileId}/scale`, {
    credentials: 'same-origin',
  });
  if (res.status !== 200) throw new Error('pdf link');
  const body = (await res.json()) as { url?: unknown };
  if (typeof body.url !== 'string') throw new Error('pdf link');
  return body.url;
}

export function PdfUnderlayPart({
  pdf,
  plan,
  canEdit,
  onSaved,
}: PdfUnderlayPartProps): ReactElement | null {
  const t = useT();
  const [page, setPage] = useState<PdfPage | null>(null);
  const [opening, setOpening] = useState(false);
  const cal = pdf.scaleCalibration;

  useEffect(() => {
    if (cal === null) return;
    let live = true;
    void (async () => {
      const opened = await openPdfPage(await linkOf(pdf.id), cal.page);
      try {
        const drawn = await drawUnderlay(opened, cal);
        if (live) plan.setUnderlay(drawn);
      } finally {
        await opened.close();
      }
    })().catch(() => {});
    return () => {
      live = false;
      plan.setUnderlay(null);
    };
  }, [plan, pdf.id, cal]);

  const open = async () => {
    setOpening(true);
    try {
      setPage(await openPdfPage(await linkOf(pdf.id)));
    } catch {
      // The banner stays; Set scale can be tried again.
    }
    setOpening(false);
  };

  const dialog =
    page !== null ? (
      <ScaleCalibrationDialog
        name={pdf.originalName}
        sourceFileId={pdf.id}
        page={page}
        onDone={(saved) => {
          setPage(null);
          void page.close();
          if (saved !== null) onSaved(saved);
        }}
      />
    ) : null;

  if (cal !== null || !canEdit) return dialog;
  return (
    <>
      <div
        role="status"
        data-testid="pdf-scale-banner"
        className={`${banner.banner} ${banner.offline}`}
      >
        <span className={banner.icon}>
          <Icon name="straighten" size={20} />
        </span>
        <span className={banner.text}>
          {t('office.pdf_scale.banner', { name: pdf.originalName })}
        </span>
        <StateButton
          data-testid="pdf-scale-banner-set"
          compact
          disabled={opening}
          onClick={() => void open()}
        >
          {t('office.pdf_scale.banner_action')}
        </StateButton>
      </div>
      {dialog}
    </>
  );
}
