'use client';
// EZD-020 Step 3 (vault/plans/EZD-020.md): loads the dev-sample lazy module on the first press only.
import { useCallback, useState } from 'react';
import { lazyModule } from '../../../lib/lazy/lazy-module';

const sample = lazyModule(() => import('../../../lazy/dev-sample'));

export function LazyProbe() {
  const [result, setResult] = useState('');
  const onClick = useCallback(() => {
    void sample.load().then((m) => setResult(m.sampleMarker()));
  }, []);
  return (
    <>
      <button type="button" data-testid="lazy-load" onClick={onClick} />
      <output data-testid="lazy-result">{result}</output>
    </>
  );
}
