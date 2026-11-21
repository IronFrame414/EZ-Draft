// EZD-701 (AC-EZD-701-1, -2): end to end through create_project and update_project_settings. Expected sets: S13
// Decision 1 and 09h Sheet set rules, Q-0779 (A6.0 only with the Reflected ceiling plan box ticked). The read goes
// through the member's session, so another company's project reads as null.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { loadProjectSheets } from './sheets';

const NINE = ['A0.0', 'A1.0', 'A2.0', 'A3.0', 'A4.0', 'A5.0', 'E1.0', 'E2.0', 'R1.0'];
const TEN = ['A0.0', 'A1.0', 'A2.0', 'A3.0', 'A4.0', 'A5.0', 'A6.0', 'E1.0', 'E2.0', 'R1.0'];

describe('EZD-701 project sheet set', () => {
  let editor: Session;
  let ownerB: Session;

  const created = async (name: string) => {
    const r = await editor.serverDb.rpc('create_project', {
      p_name: name,
      p_address: '1 Test St',
      p_type: 'kitchen',
      p_customer_id: null as never,
      p_scope_of_work: null as never,
    });
    expect(r.error).toBeNull();
    return (r.data as { project_id: string }[])[0].project_id;
  };
  const setTrades = async (project: string, trades: string[]) => {
    const r = await editor.serverDb.rpc('update_project_settings', {
      p_project: project,
      p_changes: { scope_trades: trades },
    });
    expect(r.error).toBeNull();
  };
  const numbers = async (s: Session, project: string) =>
    (await loadProjectSheets(s.serverDb, project))?.map((x) => x.number) ?? null;

  beforeAll(async () => {
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    const m1 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m1.membershipId, ['view_projects', 'edit_model', 'create_projects']);
    const m2 = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, m2.membershipId, ['view_projects', 'edit_model', 'create_projects']);
    editor = await signIn(m1.email);
    ownerB = await signIn(m2.email);
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('AC-1: a new project lists the nine default sheets, with no A6.0', async () => {
    const p = await created('Sheets default');
    expect(await numbers(editor, p)).toEqual(NINE);
  });

  it('AC-2: ticking Reflected ceiling plan adds A6.0 between A5.0 and E1.0; unticking takes it out', async () => {
    const p = await created('Sheets RCP');
    await setTrades(p, ['rcp']);
    expect(await numbers(editor, p)).toEqual(TEN);
    await setTrades(p, []);
    expect(await numbers(editor, p)).toEqual(NINE);
  });

  it("another company's project reads as no set", async () => {
    const p = await created('Sheets other company');
    expect(await numbers(ownerB, p)).toBeNull();
  });
});
