// Device layout: phone under 1024 px, full shell from 1024 px (Q-0054 (a); vault/plans/EZD-014a.md Step 1).
export const FULL_SHELL_MIN_WIDTH = 1024;
export const PHONE_LAYOUT_QUERY = '(width < 1024px)';
export const DESKTOP_REFERENCE_WIDTH = 1600;
export const COMPACT_HEADER_QUERY = '(width < 1600px)';
export const COARSE_POINTER_QUERY = '(any-pointer: coarse)';

export type DeviceLayout = 'full' | 'phone';
export type MatchMedia = (query: string) => MediaQueryList;

export function getDeviceLayout(matchMedia: MatchMedia): DeviceLayout {
  return matchMedia(PHONE_LAYOUT_QUERY).matches ? 'phone' : 'full';
}

export function subscribeDeviceLayout(matchMedia: MatchMedia, onChange: () => void): () => void {
  const list = matchMedia(PHONE_LAYOUT_QUERY);
  const handler = () => onChange();
  list.addEventListener('change', handler);
  return () => list.removeEventListener('change', handler);
}
