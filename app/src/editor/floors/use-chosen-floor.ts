'use client';
// EZD-6001 (vault/plans/EZD-6001.md D-Wire, D-Gone): the chosen floor id for a panel, read again on each switch.
import { useStoreValue } from '../shared/use-store-value';
import type { FloorChoice } from './floors';

export function useChosenFloor(floors: FloorChoice | undefined | null): string | null {
  return useStoreValue(floors, (f) => f.getState().chosenId, null);
}
