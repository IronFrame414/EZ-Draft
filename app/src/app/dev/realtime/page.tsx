import { notFound } from 'next/navigation';
import { RealtimeProbe } from './RealtimeProbe';

// EZD-018 Step 6 (vault/plans/EZD-018.md): the Realtime test page. Values only, no interface text.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[] }>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const { project } = await searchParams;
  return <RealtimeProbe projectId={typeof project === 'string' ? project : ''} />;
}
