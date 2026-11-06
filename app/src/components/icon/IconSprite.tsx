// EZD-347 (vault/plans/EZD-347.md Build step 4; D-088)
import type { ReactElement } from 'react';
import { ICON_NAMES } from './icon-names.generated';
import { ICON_SYMBOLS } from './icon-symbols.generated';
import { ICON_ID_PREFIX } from './Icon';

export function IconSprite(): ReactElement {
  return (
    <svg display="none" aria-hidden="true" focusable="false" data-testid="icon-sprite">
      {ICON_NAMES.map((name) => (
        <symbol key={name} id={`${ICON_ID_PREFIX}${name}`} viewBox={ICON_SYMBOLS[name].viewBox}>
          {ICON_SYMBOLS[name].paths.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </symbol>
      ))}
    </svg>
  );
}
