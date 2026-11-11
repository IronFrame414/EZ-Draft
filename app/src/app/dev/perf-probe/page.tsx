import { notFound } from 'next/navigation';
import { MessagesProvider } from '../../../lib/messages';
import { catalogFor } from '../../../server/messages/catalog';
import { EmptyEditor, HeaderCard } from '../../../components/shell';
import { PanCommitProbe } from './PanCommitProbe';
import { WorkerProbe } from './WorkerProbe';

// EZD-017 Step 10 (vault/plans/EZD-017.md): the empty shell, plus the pan-commit probe with ?inject=pan-commit.
// EZD-235b Build step 7: the hidden worker probe with ?inject=worker-job.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ inject?: string | string[] }>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const { inject } = await searchParams;
  return (
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <EmptyEditor header={<HeaderCard />} />
      {inject === 'pan-commit' ? <PanCommitProbe /> : null}
      {inject === 'worker-job' ? <WorkerProbe /> : null}
    </MessagesProvider>
  );
}
