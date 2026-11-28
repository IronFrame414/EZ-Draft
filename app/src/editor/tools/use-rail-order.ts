// EZD-1914 (editor plan 5.2): moved unchanged out of ProjectEditor.
// EZD-230 (Q-0038 "each user can set the order of the tools on the rail"; Q-0122): the user's own tool order, read
// by the page. A move shows at once and is saved; a failed save shows a toast and the rail keeps the new order for
// this page.
import { useCallback, useState } from 'react';
import { nextRailOrder } from '../../components/shell/rail-types';
import type { MessageKey } from '../../server/messages/catalog';

export function useRailOrder(
  initial: readonly string[] | undefined,
  onMessage: (key: MessageKey) => void,
): readonly [readonly string[], (shown: string[]) => void] {
  const [railOrder, setRailOrder] = useState<readonly string[]>(initial ?? []);
  const onRailReorder = useCallback(
    (shown: string[]) => {
      setRailOrder((stored) => {
        const next = nextRailOrder(shown, stored);
        void fetch('/api/profile/rail-order', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ order: next }),
        })
          .then((r) => r.ok)
          .catch(() => false)
          .then((ok) => {
            if (!ok) onMessage('office.rail.order_save_failed');
          });
        return next;
      });
    },
    [onMessage],
  );
  return [railOrder, onRailReorder] as const;
}
