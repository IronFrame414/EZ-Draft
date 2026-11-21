import { useSyncExternalStore } from 'react';
import type { SheetsScreen, SheetsScreenState } from './sheets-screen-store';

export function useSheetsScreen(screen: SheetsScreen): SheetsScreenState {
  return useSyncExternalStore(screen.subscribe, screen.get, screen.get);
}
