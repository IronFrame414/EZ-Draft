// EZD-710 (S13 Data shown "Title block"; S13 Decisions 5, 6, 10; S15b Decisions 1-3; AC-EZD-710-1): the open sheet's
// title block, drawn in the sheet's title block column (board S13Sheets: w/8 wide on the right, inside the border).
// The markup is the geometry package's titleBlockSvg (paper inches, every text escaped), so the PDF can print the same
// block. It sits inside the sheet preview's <svg>, whose user unit is one paper inch.
import type { ReactElement } from 'react';
import { titleBlockSvg, type SheetSize } from '@ezdraft/geometry';
import { paperInches, sheetFrame, type Sheet, type SheetSetSummary } from '../../lib/sheets/sheet-set';
import {
  sheetTitleBlockValues,
  type ProjectTitleBlock,
} from '../../lib/title-block/sheet-title-block';

// The title block column of a sheet size, paper inches from the top-left corner.
export function titleBlockColumn(size: SheetSize): { x: number; y: number; width: number; height: number } {
  const { width, height } = paperInches(size);
  const { margin, titleBlock } = sheetFrame(size);
  return { x: width - margin - titleBlock, y: margin, width: titleBlock, height: height - 2 * margin };
}

export type SheetTitleBlockProps = {
  titleBlock: ProjectTitleBlock;
  set: Pick<SheetSetSummary, 'kind' | 'sheets' | 'lastIssuedVersionId'>;
  sheet: Pick<Sheet, 'number' | 'title'>;
  size: SheetSize;
  today: Date;
  // EZD-703: the sheet's viewport scale; null with no viewport (AS NOTED).
  scale?: string | null;
};

export function sheetTitleBlockMarkup({ titleBlock, set, sheet, size, today, scale }: SheetTitleBlockProps): string {
  return titleBlockSvg(sheetTitleBlockValues(titleBlock, set, sheet, today, scale), titleBlockColumn(size));
}

export function SheetTitleBlock(props: SheetTitleBlockProps): ReactElement {
  return <g dangerouslySetInnerHTML={{ __html: sheetTitleBlockMarkup(props) }} />;
}
