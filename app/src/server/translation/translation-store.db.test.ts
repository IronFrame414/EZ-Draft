// EZD-1501 (AC-EZD-1501-1: "The same English phrase (after trimming and collapsing spaces) used on two jobs of one
// company is one translation row; the same phrase in another company is that company's own row, and neither company
// can read or change the other's."; 03c translation "Cached across jobs"; vault/build/assumptions/EZD-1501.md settled
// rows: no member reads the rows directly; CLAUDE.md rule 4). Expected counts come from the acceptance criterion.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { normalizePhrase } from './store';

async function codeOf(work: PromiseLike<unknown>): Promise<string | null> {
  try {
    await work;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? 'no_code';
  }
}

// The drafting job's write path: server-side definer code (EZD-1502) calls this function for a company.
async function store(tenantId: string, phrase: string): Promise<string> {
  const [row] = await harnessSql()<{ id: string }[]>`
    select private.store_translation_phrase(${tenantId}::uuid, ${phrase})::text as id`;
  return row.id;
}

describe('EZD-1501 translation store (database)', () => {
  const PHRASE = `Set shower valve at 48" AFF ${randomUUID().slice(0, 8)}`;
  let tenantA = '';
  let tenantB = '';
  let a: Session;
  let b: Session;

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    const ma = await createMember({ tenantId: tenantA, scope: 'all' });
    const mb = await createMember({ tenantId: tenantB, scope: 'all' });
    a = await signIn(ma.email);
    b = await signIn(mb.email);
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  describeTenantIsolation('translation', {
    makeRow: (t) => ({ tenant_id: t, phrase_en: `Iso phrase ${randomUUID()}` }),
  });

  it('AC-EZD-1501-1 the same phrase, trimmed and with spaces collapsed, on two jobs of one company is one row', async () => {
    // Job 1 typed it with extra spaces, a tab and a line break; job 2 typed it plainly.
    const first = await store(
      tenantA,
      `  ${PHRASE.replace(/ /g, '   ').replace('48"', '48"\t\n')}\t `,
    );
    const second = await store(tenantA, PHRASE);
    expect(second).toBe(first);

    const rows = await harnessSql()<{ id: string; phrase_en: string; text_es: string | null }[]>`
      select id::text, phrase_en, text_es from public.translation where tenant_id = ${tenantA}::uuid`;
    expect(rows).toEqual([{ id: first, phrase_en: PHRASE, text_es: null }]);
  });

  it("AC-EZD-1501-1 the same phrase in another company is that company's own row", async () => {
    const mine = await store(tenantA, PHRASE);
    const theirs = await store(tenantB, PHRASE);
    expect(theirs).not.toBe(mine);

    const rows = await harnessSql()<{ id: string; tenant_id: string }[]>`
      select id::text, tenant_id::text from public.translation where phrase_en = ${PHRASE}`;
    expect(rows).toHaveLength(2);
    expect(new Map(rows.map((r) => [r.tenant_id, r.id]))).toEqual(
      new Map([
        [tenantA, mine],
        [tenantB, theirs],
      ]),
    );
  });

  it("AC-EZD-1501-1 neither company's member can read or change the other's row", async () => {
    const mine = await store(tenantA, PHRASE);
    const theirs = await store(tenantB, PHRASE);
    await harnessSql()`update public.translation set text_es = 'Ponga la válvula' where id = ${mine}::uuid`;

    for (const [s, other] of [
      [b, mine],
      [a, theirs],
    ] as const) {
      const read = await s.serverDb.from('translation').select('id').eq('id', other);
      expect(read.error).toBeNull();
      expect(read.data).toEqual([]);
      const upd = await s.serverDb
        .from('translation')
        .update({ text_es: 'cambiado' })
        .eq('id', other)
        .select('id');
      expect(upd.data ?? []).toEqual([]);
      const del = await s.serverDb.from('translation').delete().eq('id', other).select('id');
      expect(del.data ?? []).toEqual([]);
    }
    const ins = await b.serverDb
      .from('translation')
      .insert({ tenant_id: tenantA, phrase_en: `Planted ${randomUUID()}` });
    expect(ins.error?.code).toBe('42501');

    const after = await harnessSql()<{ id: string; text_es: string | null }[]>`
      select id::text, text_es from public.translation where phrase_en = ${PHRASE} order by text_es nulls last`;
    expect(after).toEqual([
      { id: mine, text_es: 'Ponga la válvula' },
      { id: theirs, text_es: null },
    ]);
  });

  it("a member does not read even their own company's rows directly (phrases span every project)", async () => {
    const mine = await store(tenantA, PHRASE);
    const read = await a.serverDb.from('translation').select('id').eq('id', mine);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);
  });

  it('the store function is not callable by members, and refuses a blank phrase', async () => {
    const [row] = await harnessSql()<{ auth: boolean; svc: boolean; anon: boolean }[]>`
      select has_function_privilege('authenticated', 'private.store_translation_phrase(uuid, text)', 'execute') as auth,
             has_function_privilege('service_role', 'private.store_translation_phrase(uuid, text)', 'execute') as svc,
             has_function_privilege('anon', 'private.store_translation_phrase(uuid, text)', 'execute') as anon`;
    expect(row).toEqual({ auth: false, svc: false, anon: false });
    expect(await codeOf(store(tenantA, ' \t\n '))).toBe('22023');
  });

  it('the database keeps every stored phrase in its trimmed, collapsed form, the same as normalizePhrase', async () => {
    expect(
      await codeOf(
        harnessSql()`insert into public.translation (tenant_id, phrase_en) values (${tenantA}::uuid, ${'  two  spaces '})`,
      ),
    ).toBe('23514');
    const typed = ' Frame\t niche   14" x 24"\n';
    const id = await store(tenantA, typed);
    const [row] = await harnessSql()<{ phrase_en: string }[]>`
      select phrase_en from public.translation where id = ${id}::uuid`;
    expect(row.phrase_en).toBe('Frame niche 14" x 24"');
    expect(normalizePhrase(typed)).toBe(row.phrase_en);
  });
});
