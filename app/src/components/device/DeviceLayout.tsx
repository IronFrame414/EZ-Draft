'use client';
// Renders the full tree or the phone tree by window width (vault/plans/EZD-014a.md Step 7).
import type { ReactNode } from 'react';
import { useDeviceLayout } from '../../lib/device/useDeviceLayout';

export type DeviceLayoutProps = { full: ReactNode; phone: ReactNode };

export function DeviceLayout({ full, phone }: DeviceLayoutProps) {
  const layout = useDeviceLayout();
  return <>{layout === 'phone' ? phone : full}</>;
}
