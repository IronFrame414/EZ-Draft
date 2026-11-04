import { notFound } from 'next/navigation';
import { StorageProbe } from './StorageProbe';

// EZD-132 Step 13 (vault/plans/EZD-132.md): the file storage test page. Values only, no interface text.
type Query = { project?: string | string[]; kind?: string | string[] };

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : '');

export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const query = await searchParams;
  return <StorageProbe projectId={one(query.project)} kind={one(query.kind) || 'pdf'} />;
}
