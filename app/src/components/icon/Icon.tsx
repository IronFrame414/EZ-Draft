import type { IconName } from './icon-names.generated';

export function Icon({ name, size }: { name: IconName; size: number }) {
  return (
    <svg width={size} height={size} aria-hidden="true" focusable="false" fill="currentColor">
      <use href={`/icons/sprite.svg#${name}`} />
    </svg>
  );
}
