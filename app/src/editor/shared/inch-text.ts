// EZD-1906a (editor plan R7): a length in inches as shown in the editor, whole inches and a reduced fraction to
// 1/16" (03g) with the inch mark, in place of `${formatInches(n)}"` at each screen.
import { formatInches } from '../../lib/catalog/catalog';

export const inchText = (inches: number): string => `${formatInches(inches)}"`;
