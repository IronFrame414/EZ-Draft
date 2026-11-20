'use client';

// EZD-313 (S02 Decisions "Finish import writes the items, marks step 3 done and opens 03 Plan with a short notice
// of the counts imported"): the notice Plan shows once after Finish import. Import review opens
// /projects/[id]?imported=walls.windows.doors.rooms; the page passes the parsed counts here, this shows them as one
// toast and takes the query off the address, so a reload does not show it again.
import { useEffect, useRef } from 'react';
import { useToast } from '../../components/states/ToastProvider';
import type { ImportedCounts } from './imported';

export function ImportedNotice({ counts }: { counts: ImportedCounts }): null {
  const toast = useToast();
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    toast.show({ message: 'office.plan.imported', params: counts, tone: 'success' });
    const url = new URL(window.location.href);
    if (url.searchParams.has('imported')) {
      url.searchParams.delete('imported');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  }, [toast, counts]);
  return null;
}
