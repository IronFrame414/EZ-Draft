import { notFound } from 'next/navigation';
import { JobsProbe } from './JobsProbe';

// EZD-009 Step 7 (vault/plans/EZD-009.md): the background jobs test page. Values only, no interface text.
type Query = { project?: string | string[]; steps?: string | string[]; stepMs?: string | string[] };

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : '');

export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const query = await searchParams;
  return (
    <JobsProbe
      projectId={one(query.project)}
      steps={Number(one(query.steps))}
      stepMs={Number(one(query.stepMs))}
    />
  );
}
