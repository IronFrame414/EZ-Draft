// EZD-126 (11 Budgets): the phone and no-access notices and the conflict banner load when shown; a ready desktop
// editor with every change saved shows none of them. EZD-1913c: one part for all three, drawn by ProjectEditor (the
// phone and no-access notices) and by features/conflicts.tsx (the banner).
import type { ReactNode } from 'react';
import { lazyModule } from '../../lib/lazy/lazy-module';
import type { ConflictBannerProps } from '../conflicts/ConflictBanner';
import { lazyPart } from './lazy-part';

const noticesModule = lazyModule(() => import('../../lazy/editor-notices'));

export const LazyNotice = lazyPart(
  noticesModule,
  (
    mod,
    {
      name,
      ...props
    }: { name: 'NoAccess' | 'EditorPhoneNotice' | 'ConflictBanner' } & Partial<ConflictBannerProps>,
  ) => {
    const Notice = mod[name] as (p: typeof props) => ReactNode;
    return <Notice {...props} />;
  },
);
