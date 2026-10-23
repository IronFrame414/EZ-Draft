import { notFound } from 'next/navigation';
import { ThrowProbe } from './ThrowProbe';

// EZD-024 Step 11 (vault/plans/EZD-024.md): the browser error test page. Values only, no interface text.
type Query = { nonce?: string | string[] };

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : '');

export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const query = await searchParams;
  return <ThrowProbe nonce={one(query.nonce)} />;
}
