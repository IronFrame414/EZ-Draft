// EZD-020 Step 3 (vault/plans/EZD-020.md): test page for the lazy-module pattern; not found in production.
import { notFound } from 'next/navigation';
import { LazyProbe } from './LazyProbe';

export default function Page() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return <LazyProbe />;
}
