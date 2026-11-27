// Device layout (vault/plans/EZD-014a.md Step 1; Q-0908, which changes Q-0054 (a)): the full shell from 1024 px wide
// at any height, and from 744 px wide on a screen at least 744 px tall (an iPad held upright, EZD-2031); anything
// else, a phone also when held sideways, gets the phone layout. EditorFrame.module.css hides the frame by the same query.
export const FULL_SHELL_MIN_WIDTH = 1024;
export const UPRIGHT_MIN_SIDE = 744;
export const PHONE_LAYOUT_QUERY = '(width < 744px), (width < 1024px) and (height < 744px)';
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
