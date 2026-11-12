import { notFound } from 'next/navigation';
import { MessagesProvider } from '../../../lib/messages';
import { catalogFor } from '../../../server/messages/catalog';
import { PanCommitProbe } from '../perf-probe/PanCommitProbe';
import { BenchmarkPlan } from './BenchmarkPlan';

// EZD-207c Build step 7 (vault/plans/EZD-207c.md D-Page): the plan canvas on the generated benchmark model, with
// the pan-commit probe on ?inject=pan-commit. Not found in production.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ inject?: string | string[] }>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const { inject } = await searchParams;
  return (
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <div data-perf-wait-plan="">
        <BenchmarkPlan />
      </div>
      {inject === 'pan-commit' ? <PanCommitProbe /> : null}
    </MessagesProvider>
  );
}
