'use client';
// EZD-6001 (vault/plans/EZD-6001.md D-Wire, D-Gone): the chosen floor id for a panel, read again on each switch.
import { useSyncExternalStore } from 'react';
import type { FloorChoice } from './floors';

const noSubscribe = () => () => {};
const none = () => null;

export function useChosenFloor(floors: FloorChoice | undefined | null): string | null {
  const read = floors ? () => floors.getState().chosenId : none;
  return useSyncExternalStore(floors ? floors.subscribe : noSubscribe, read, read);
}
