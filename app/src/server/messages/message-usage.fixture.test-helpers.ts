// EZD-1995: a sample page file for page-messages-coverage.test.ts, which checks that the reader finds each kind of
// message use below. Never imported by the app.
import { LENGTH_REFUSED_MESSAGE_KEY } from '@ezdraft/geometry';
import { lazyModule } from '../../lib/lazy/lazy-module';
import { withScreenMessages } from '../../lib/messages/screen-messages';

export const versionsModule = lazyModule(() => import('../../lazy/versions'));
export const countertopsModule = lazyModule(() =>
  withScreenMessages(import('../../lib/messages/screens/countertops.messages'), import('../../lazy/countertops')),
);

const DEVICE = 'office.device';

export function samples(t: (key: string) => string, id: string, perm: string, labels: string): string[] {
  void fetch(`/api/projects/${id}/sync-conflicts`);
  return [
    t('office.projects.title'),
    t(LENGTH_REFUSED_MESSAGE_KEY),
    t(`office.users.perm.${perm}`),
    t(`${DEVICE}.offline_icon.online`),
    t(`${labels}.offline_icon.${perm}`),
  ];
}
