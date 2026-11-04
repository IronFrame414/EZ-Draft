'use client';
// EZD-171 (vault/plans/EZD-171.md D8): shows the two reads as JSON. Values only, no interface text.
import { useEffect, useState } from 'react';
import { runCloudCheck, type CloudCheckResult } from './cloud-check';

export function CloudCheckProbe() {
  const [result, setResult] = useState<CloudCheckResult | null>(null);

  useEffect(() => {
    let active = true;
    void runCloudCheck().then((r) => {
      if (active) setResult(r);
    });
    return () => {
      active = false;
    };
  }, []);

  const state = result === null ? 'loading' : 'error' in result ? 'error' : 'done';
  return (
    <pre data-testid="cloud-check-result" data-state={state}>
      {result === null ? '' : JSON.stringify(result, null, 2)}
    </pre>
  );
}
