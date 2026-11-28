// EZD-404: the cabinet run and countertop screens have no typed bar of the plan.
import type { LayerPart } from './types';

export const part: LayerPart = {
  id: 'cabinets',
  order: 50,
  noTypedEntry: ['cabinets', 'countertops'],
};
