// EZD-007f Step 10 (vault/plans/EZD-007f.md section 3; Q-0039 (c); R26 R17; Q-0121 (a)): the signed-in
// home until Phase 1: it requires a session and shows only Sign out, in office English.
import { connection } from 'next/server';
import { SignOutButton } from '../components/auth/SignOutButton';
import { MessagesProvider } from '../lib/messages';
import { requireSession } from '../server/auth/session';
import { catalogFor } from '../server/messages/catalog';

export default async function Page() {
  // Render per request: without Supabase settings at build time requireSession() never reads the
  // cookies, so Next.js would otherwise prerender a permanent redirect to /sign-in.
  await connection();
  await requireSession();
  return (
    <main>
      <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
        <SignOutButton />
      </MessagesProvider>
    </main>
  );
}
