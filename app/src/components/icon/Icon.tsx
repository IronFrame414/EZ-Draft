import type { IconName } from './icon-names.generated';

// EZD-347 (vault/plans/EZD-347.md Build step 3; D-088)
export const ICON_ID_PREFIX = 'ez-icon-';

export function Icon({ name, size }: { name: IconName; size: number }) {
  return (
    <svg width={size} height={size} aria-hidden="true" focusable="false" fill="currentColor">
      <use href={`#${ICON_ID_PREFIX}${name}`} />
    </svg>
  );
}
