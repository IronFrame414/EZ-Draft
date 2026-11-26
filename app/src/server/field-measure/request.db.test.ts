// EZD-1422 on the local stack (AC-EZD-1422-1 "Creating a project with source Field measure emails the Foreman an S17b
// link, and the project opens on Import review after a send"; S01 Input source; Q-0204 "The project shows 'Waiting
// for field measurements', who it was sent to and a Resend button; it never expires. The sender or anyone who can
// edit the project can cancel it."; CLAUDE.md rule 4). Expected values: the request emails the Foreman's own address
// the project's S17b screen (/projects/<id>/field-measure, the EZD-1415 route) at the app origin; Projects lists the
// project as waiting, sent to the Foreman's name, mine for the sender only; Resend emails again; a send from the
// phone ends the wait and the project opens on its Import review (/projects/<id>/import/<send id>, EZD-1418) until
// the review closes; Cancel ends the wait. Another company can neither read nor change the request.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
import { setPermissions } from '../../../test-harness/permissions/grant';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { emptyRoom, initialRooms, withShape } from '../../field-measure/rooms';
import type { SendEmailInput, SendEmailResult } from '../email/types';
import { syncFieldAction } from '../outbox/field-actions';
import { listProjects } from '../projects/projects';
import type { DbClient } from '../storage/objects';
import { cancelFieldMeasure, requestFieldMeasure, resendFieldMeasure } from './request';
import { fieldMeasureReviewJob } from './review-redirect';

type Who = { session: Session; appUserId: string; membershipId: string; email: string };
const db = (w: Who) => w.session.serverDb as unknown as DbClient;

async function memberWith(tenant: string, permissions: string[], name?: string): Promise<Who> {
  const m = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, m.membershipId, permissions as never);
  if (name !== undefined) {
    await harnessSql()`update public.app_user set name = ${name} where id = ${m.appUserId}::uuid`;
  }
  return {
    session: await signIn(m.email),
    appUserId: m.appUserId,
    membershipId: m.membershipId,
    email: m.email,
  };
}

function outbox() {
  const sent: SendEmailInput[] = [];
  const send = async (i: SendEmailInput): Promise<SendEmailResult> => {
    sent.push(i);
    return { link: i.link.url, status: 'sent', transport: 'stub', messageId: 'm', errorCode: null };
  };
  return { sent, deps: { send, env: {} } };
}

const waitOf = async (who: Who, projectId: string) => {
  const page = await listProjects(
    db(who) as never,
    { tab: 'all', sort: 'edited', after: null },
    '',
  );
  return page.items.find((p) => p.id === projectId)?.fieldMeasureWait ?? null;
};

// This file leaves due job rows in the queue (the send's import), so it holds the shared job-queue lock.
let releaseJobQueue: (() => Promise<void>) | undefined;
beforeAll(async () => {
  releaseJobQueue = await holdJobQueueShared();
}, 180000);
afterAll(async () => {
  await releaseJobQueue?.();
});

describe('EZD-1422 Field measure request', () => {
  let p1 = '';
  let p2 = '';
  let p3 = '';
  let office: Who;
  let editor: Who;
  let viewer: Who;
  let foreman: Who;
  let noCreate: Who;
  let otherCo: Who;
  let otherForeman: Who;

  beforeAll(async () => {
    const tA = await createTenant();
    [p1, p2, p3] = await createProjects(tA, 3);
    office = await memberWith(tA, ['view_projects', 'create_projects', 'edit_model']);
    editor = await memberWith(tA, ['view_projects', 'edit_model']);
    viewer = await memberWith(tA, ['view_projects']);
    foreman = await memberWith(tA, ['view_projects', 'send_field_measurement'], 'Luis Ortega');
    noCreate = await memberWith(tA, ['view_projects', 'edit_model']);
    const tB = await createTenant();
    otherCo = await memberWith(tB, ['view_projects', 'create_projects', 'edit_model']);
    otherForeman = await memberWith(tB, ['view_projects', 'send_field_measurement'], 'Ana Ruiz');
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('emails the Foreman the S17b link and the project shows as waiting, sent to the Foreman', async () => {
    const box = outbox();
    const r = await requestFieldMeasure(
      db(office),
      { projectId: p1, membershipId: foreman.membershipId },
      box.deps,
    );
    const link = `http://localhost:3000/projects/${p1}/field-measure`;
    expect(r).toEqual({ ok: true, request: { sentTo: 'Luis Ortega', link, emailSent: true } });
    expect(box.sent).toHaveLength(1);
    expect(box.sent[0]!.to).toBe(foreman.email);
    expect(box.sent[0]!.link.url).toBe(link);
    expect(box.sent[0]!.sentBy).toEqual({ email: office.email });

    expect(await waitOf(office, p1)).toEqual({ sentTo: 'Luis Ortega', mine: true });
    expect(await waitOf(viewer, p1)).toEqual({ sentTo: 'Luis Ortega', mine: false });
    expect(await waitOf(office, p2)).toBeNull();
    // Waiting is not reviewing: the project opens on the plan.
    expect(await fieldMeasureReviewJob(db(office), p1)).toBeNull();
  });

  it('refuses a second request, a Foreman of another company and a member without Create projects', async () => {
    const box = outbox();
    expect(
      await requestFieldMeasure(
        db(office),
        { projectId: p1, membershipId: foreman.membershipId },
        box.deps,
      ),
    ).toEqual({ ok: false, code: 'already_requested' });
    expect(
      await requestFieldMeasure(
        db(office),
        { projectId: p2, membershipId: otherForeman.membershipId },
        box.deps,
      ),
    ).toEqual({ ok: false, code: 'foreman_unavailable' });
    expect(
      await requestFieldMeasure(
        db(noCreate),
        { projectId: p2, membershipId: foreman.membershipId },
        box.deps,
      ),
    ).toEqual({ ok: false, code: 'permission_denied' });
    expect(box.sent).toHaveLength(0);
  });

  it('Resend emails the Foreman again for the sender or Edit model, and no one else', async () => {
    const box = outbox();
    const r = await resendFieldMeasure(db(office), p1, box.deps);
    expect(r).toMatchObject({ ok: true, request: { sentTo: 'Luis Ortega', emailSent: true } });
    const byEditor = await resendFieldMeasure(db(editor), p1, box.deps);
    expect(byEditor).toMatchObject({ ok: true });
    expect(box.sent.map((m) => m.to)).toEqual([foreman.email, foreman.email]);
    expect(await resendFieldMeasure(db(viewer), p1, box.deps)).toEqual({
      ok: false,
      code: 'permission_denied',
    });
    expect(await cancelFieldMeasure(db(viewer), p1)).toEqual({
      ok: false,
      code: 'permission_denied',
    });
    expect(box.sent).toHaveLength(2);
  });

  it('another company can neither read nor change the request, and no member writes the table directly', async () => {
    const box = outbox();
    const { data } = await otherCo.session.serverDb.from('field_measure_request').select('id');
    expect(data ?? []).toEqual([]);
    expect(await resendFieldMeasure(db(otherCo), p1, box.deps)).toEqual({
      ok: false,
      code: 'project_not_found',
    });
    expect(await cancelFieldMeasure(db(otherCo), p1)).toEqual({
      ok: false,
      code: 'project_not_found',
    });
    expect(
      await requestFieldMeasure(
        db(otherCo),
        { projectId: p2, membershipId: otherForeman.membershipId },
        box.deps,
      ),
    ).toEqual({ ok: false, code: 'project_not_found' });
    expect(box.sent).toHaveLength(0);

    const upd = await office.session.serverDb
      .from('field_measure_request')
      .update({ sent_to_name: 'Someone else' })
      .eq('project_id', p1)
      .select('id');
    expect(upd.data ?? []).toEqual([]);
    const ins = await office.session.serverDb
      .from('field_measure_request')
      .insert({
        tenant_id: '00000000-0000-4000-8000-000000000000',
        project_id: p2,
        sent_to_name: 'X',
      });
    expect(ins.error).not.toBeNull();
    const [row] = await harnessSql()<{ sent_to_name: string; sent_count: number }[]>`
      select sent_to_name, sent_count from public.field_measure_request where project_id = ${p1}::uuid`;
    expect(row).toEqual({ sent_to_name: 'Luis Ortega', sent_count: 3 });
  });

  it("after the Foreman's send the project opens on its Import review until the review closes", async () => {
    const kitchen = withShape(emptyRoom('r1', 'room', 'Kitchen'), 'rectangle');
    const rooms = [initialRooms()[0]!, { ...kitchen, lengths: [144, 120, 144, 120], ceiling: 96 }];
    const changeId = crypto.randomUUID();
    const r = await syncFieldAction(db(foreman), p1, {
      id: changeId,
      deviceId: '33333333-3333-4333-8333-333333333333',
      kind: 'field_measure_send',
      ops: { rooms },
      baseVersionId: null,
      queuedAt: Date.UTC(2026, 10, 25, 15, 0, 0),
      photo: null,
    });
    expect(r).toMatchObject({ ok: true, status: 'synced' });

    expect(await fieldMeasureReviewJob(db(office), p1)).toBe(changeId);
    expect(await waitOf(office, p1)).toBeNull();
    expect(await resendFieldMeasure(db(office), p1, outbox().deps)).toEqual({
      ok: false,
      code: 'not_waiting',
    });
    // Another company never learns of the review.
    expect(await fieldMeasureReviewJob(db(otherCo), p1)).toBeNull();

    await harnessSql()`
      update public.import_session set status = 'finished' where job_id = ${changeId}::uuid`;
    expect(await fieldMeasureReviewJob(db(office), p1)).toBeNull();
  });

  describeTenantIsolation('field_measure_request', {
    makeRow: (t, ctx) => ({ tenant_id: t, project_id: ctx.projectIds[0], sent_to_name: 'Luis Ortega' }),
  });

  it('Cancel by the sender ends the wait; a project without a request never redirects', async () => {
    const box = outbox();
    expect(
      await requestFieldMeasure(
        db(office),
        { projectId: p3, membershipId: foreman.membershipId },
        box.deps,
      ),
    ).toMatchObject({ ok: true });
    expect(await waitOf(office, p3)).toEqual({ sentTo: 'Luis Ortega', mine: true });
    expect(await cancelFieldMeasure(db(office), p3)).toEqual({ ok: true });
    expect(await waitOf(office, p3)).toBeNull();
    expect(await cancelFieldMeasure(db(office), p3)).toEqual({ ok: false, code: 'not_waiting' });
    expect(await resendFieldMeasure(db(office), p3, box.deps)).toEqual({
      ok: false,
      code: 'not_waiting',
    });
    expect(await fieldMeasureReviewJob(db(office), p2)).toBeNull();
  });
});
