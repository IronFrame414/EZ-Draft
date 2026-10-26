import { notFound } from 'next/navigation';
import { CloudCheckProbe } from './CloudCheckProbe';
import { readClaims } from './session-read';

// EZD-171 (vault/plans/EZD-171.md D7; Q-0306 (a)): in production only a signed-in request sees this page.
export const dynamic = 'force-dynamic';

export default async function Page() {
  if (process.env.VERCEL_ENV === 'production') {
    const claims = await readClaims();
    if (claims.kind !== 'signed_in') notFound();
  }
  return <CloudCheckProbe />;
}
