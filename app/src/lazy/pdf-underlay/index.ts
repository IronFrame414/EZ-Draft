// EZD-304 (11 Performance rule 7; ARCH Entry points and lazy modules): pdf.js for the set-scale step and the plan
// underlay, with the set-scale dialog, loaded through lazyModule when a PDF is first shown, so pdf.js stays out of
// every entry.
export { drawUnderlay, openPdfPage, UNDERLAY_MAX_PX, type PdfPage } from './pdf-page';
export { ScaleCalibrationDialog, type ScaleCalibrationProps } from './ScaleCalibrationDialog';
export { PdfUnderlayPart, type PdfUnderlayPartProps, type UnderlayPdf } from './PdfUnderlayPart';
