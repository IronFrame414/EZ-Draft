// EZD-221a U9, U10 (vault/plans/EZD-221a.md section 4; AC-EZD-221-2, -3, -6). Expected values: section 1
// Decided "parseNewProject" (strict template object, key one of the four, each size isTemplateSize; absent or
// null gives template null; any failure null; AC-2; Q-0570; L-052) and "createProject" (template null: the
// unchanged create_project call with 5 args; else one create_project_with_objects call with the same 5 args plus
// p_objects = buildTemplateObjects(template); one shared error mapping 42501 permission_denied, 22023
// customer_unavailable / invalid_input, other errors thrown, no row create_project_no_row; Q-0566; Q-0568;
// projects.ts:213-226). The base body is the EZD-118 `valid` body of new-project-input.test.ts:9-15.
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../db/database.types';
import { createProject, parseNewProject, type NewProjectValues } from './projects';

const valid = {
  name: '  Kitchen remodel ',
  address: ' 12 Oak Ave  ',
  type: 'kitchen',
  customerId: null,
  scopeOfWork: '  ',
};

const L_KITCHEN = { key: 'l_kitchen', width: 141.5, length: 168, ceilingHeight: 96 } as const;

describe('EZD-221a parseNewProject template', () => {
  it('EZD-221a U9 parse: template absent or null gives null, a valid template is kept, the rest refused', () => {
    expect(parseNewProject(valid)?.template).toBeNull();
    expect(parseNewProject({ ...valid, template: null })?.template).toBeNull();
    const kept = parseNewProject({ ...valid, template: { ...L_KITCHEN } });
    expect(kept).not.toBeNull();
    expect(kept?.template).toEqual({
      key: 'l_kitchen',
      width: 141.5,
      length: 168,
      ceilingHeight: 96,
    });

    const refused: unknown[] = [
      { ...L_KITCHEN, key: 'garage' },
      { ...L_KITCHEN, width: 0 },
      { ...L_KITCHEN, width: 2400.0625 },
      { ...L_KITCHEN, width: 141.53 },
      { ...L_KITCHEN, width: '141.5' },
      { key: 'l_kitchen', width: 141.5, length: 168 },
      { ...L_KITCHEN, foo: 1 },
      'l_kitchen',
      [],
    ];
    for (const template of refused) {
      expect(parseNewProject({ ...valid, template }), JSON.stringify(template)).toBeNull();
    }
  });
});

describe('EZD-221a createProject template', () => {
  const P = '11111111-1111-4111-8111-111111111111';
  const T = '22222222-2222-4222-8222-222222222222';
  // parseNewProject(valid) as EZD-118 U2 gives it (new-project-input.test.ts:19-25).
  const base = {
    name: 'Kitchen remodel',
    address: '12 Oak Ave',
    type: 'kitchen',
    customerId: null,
    scopeOfWork: null,
  } as const;
  const fiveArgs = {
    p_name: 'Kitchen remodel',
    p_address: '12 Oak Ave',
    p_type: 'kitchen',
    p_customer_id: null,
    p_scope_of_work: null,
  };
  const plain = { ...base, template: null } as NewProjectValues;
  const withTemplate = { ...base, template: { ...L_KITCHEN } } as NewProjectValues;
  const stubOf = (answer: { data: unknown; error: unknown }) => {
    const rpc = vi.fn(async () => answer);
    return { rpc, client: { rpc } as unknown as SupabaseClient<Database> };
  };
  const okAnswer = { data: [{ project_id: P, tenant_id: T }], error: null };

  it('EZD-221a U10 create call: one rpc per create, the template path, one error mapping', async () => {
    // (a) no template: the unchanged create_project call
    const a = stubOf(okAnswer);
    expect(await createProject(a.client, plain)).toEqual({ ok: true, projectId: P, tenantId: T });
    expect(a.rpc).toHaveBeenCalledTimes(1);
    expect(a.rpc).toHaveBeenCalledWith('create_project', fiveArgs);

    // (b) L-kitchen: one create_project_with_objects call with the 5 args and 5 objects
    const b = stubOf(okAnswer);
    expect(await createProject(b.client, withTemplate)).toEqual({
      ok: true,
      projectId: P,
      tenantId: T,
    });
    expect(b.rpc).toHaveBeenCalledTimes(1);
    const [name, args] = b.rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(name).toBe('create_project_with_objects');
    expect(Object.keys(args).sort()).toEqual([...Object.keys(fiveArgs), 'p_objects'].sort());
    for (const [k, v] of Object.entries(fiveArgs)) expect(args[k], k).toBe(v);
    const objects = args.p_objects as { type: string; data: { attributes: { name?: string } } }[];
    expect(objects).toHaveLength(5);
    expect(objects.map((o) => o.type)).toEqual(['wall', 'wall', 'wall', 'wall', 'room']);
    expect(objects[4].data.attributes.name).toBe('L-kitchen');

    // (c) - (e) the shared error mapping
    const c = stubOf({ data: null, error: { code: '42501' } });
    expect(await createProject(c.client, withTemplate)).toEqual({
      ok: false,
      code: 'permission_denied',
    });
    expect(c.rpc).toHaveBeenCalledTimes(1);
    const d = stubOf({ data: null, error: { code: '22023', message: 'invalid_input' } });
    expect(await createProject(d.client, withTemplate)).toEqual({
      ok: false,
      code: 'invalid_input',
    });
    const e = stubOf({ data: null, error: { code: '22023', message: 'customer_unavailable' } });
    expect(await createProject(e.client, withTemplate)).toEqual({
      ok: false,
      code: 'customer_unavailable',
    });

    // (f) any other error is thrown as it came
    const fError = { code: '23503', message: 'level_not_found' };
    const f = stubOf({ data: null, error: fError });
    await expect(createProject(f.client, withTemplate)).rejects.toBe(fError);

    // (g) no row
    const g = stubOf({ data: [], error: null });
    await expect(createProject(g.client, withTemplate)).rejects.toThrow('create_project_no_row');
    expect(g.rpc).toHaveBeenCalledTimes(1);
    expect((g.rpc.mock.calls[0] as unknown[])[0]).toBe('create_project_with_objects');
  });
});
