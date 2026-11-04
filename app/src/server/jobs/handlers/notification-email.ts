// EZD-110a Step 11 (vault/plans/EZD-110a.md Decided D5, D6, D7, D22, D27; section 6 "Email body"; Q-0413):
// the notification_email job, one per notification. It runs with the secret key, so every query is filtered
// by the job's tenant. A missing notification or a person without an active membership sends nothing; an
// already emailed notification sends nothing again (safe to run twice; the send also carries an idempotency
// key from the job id). The email is English with no company (a system email, ARCH Email); its link is the
// notification's stored link on the app address. A failed send is retried by the job queue.
import { z } from 'zod';
import {
  notificationTitle,
  type NotificationKind,
  type NotificationParams,
} from '../../../lib/notifications/kinds';
import { sendEmail, toSubjectLine } from '../../email/send';
import { appOrigin } from '../../errors/app-origin';
import { getT } from '../../messages/get-t';
import { createJobsDbClient } from '../db';
import { JobError } from '../errors';
import type { JobHandler } from '../registry';

export type NotificationEmailPayload = { notificationId: string };
export type NotificationEmailResult = { emailed: boolean };

export const notificationEmailHandler: JobHandler<
  NotificationEmailPayload,
  never,
  NotificationEmailResult
> = {
  kind: 'notification_email',
  payload: z.object({ notificationId: z.uuid() }),
  result: z.object({ emailed: z.boolean() }),
  async run(ctx) {
    const db = createJobsDbClient();
    const tenantId = ctx.job.tenant_id;

    const { data: row, error: rowError } = await db
      .from('notification')
      .select('id, user_id, kind, payload, link, project_id, emailed_at')
      .eq('tenant_id', tenantId)
      .eq('id', ctx.payload.notificationId)
      .maybeSingle();
    if (rowError) throw rowError;
    if (!row) return { done: { emailed: false } };

    const { data: membership, error: membershipError } = await db
      .from('membership')
      .select('id, scope')
      .eq('tenant_id', tenantId)
      .eq('user_id', row.user_id)
      .eq('status', 'active')
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return { done: { emailed: false } };

    if (row.emailed_at !== null) return { done: { emailed: true } };

    // EZD-140 D5: the person turned this kind's Email off after the job was queued; nothing is sent.
    const { data: setting, error: settingError } = await db
      .from('notification_setting')
      .select('email')
      .eq('tenant_id', tenantId)
      .eq('user_id', row.user_id)
      .eq('kind', row.kind)
      .maybeSingle();
    if (settingError) throw settingError;
    if (setting?.email === false) return { done: { emailed: false } };

    const { data: user, error: userError } = await db
      .from('app_user')
      .select('email')
      .eq('id', row.user_id)
      .single();
    if (userError) throw userError;

    const t = getT('office', 'en');
    const title = notificationTitle(row.kind as NotificationKind, row.payload as NotificationParams);
    const titleText = t(title.key, title.params);
    const paragraphs = [titleText];

    // D6: the project line only when the project exists in the tenant and the membership may see it.
    if (row.project_id !== null) {
      const { data: project, error: projectError } = await db
        .from('project')
        .select('id, name, customer_id')
        .eq('tenant_id', tenantId)
        .eq('id', row.project_id)
        .maybeSingle();
      if (projectError) throw projectError;
      let visible = project !== null && membership.scope === 'all';
      if (project !== null && membership.scope === 'listed') {
        const { data: listed, error: listedError } = await db
          .from('membership_project')
          .select('project_id')
          .eq('tenant_id', tenantId)
          .eq('membership_id', membership.id)
          .eq('project_id', project.id)
          .maybeSingle();
        if (listedError) throw listedError;
        visible = listed !== null;
      }
      if (project !== null && visible) {
        let clientName: string | null = null;
        if (project.customer_id !== null) {
          const { data: customer, error: customerError } = await db
            .from('customer')
            .select('name')
            .eq('tenant_id', tenantId)
            .eq('id', project.customer_id)
            .maybeSingle();
          if (customerError) throw customerError;
          clientName = customer?.name ?? null;
        }
        paragraphs.push(
          clientName === null
            ? project.name
            : t('office.notifications.project_line', { project: project.name, client: clientName }),
        );
      }
    }

    const result = await sendEmail({
      to: user.email,
      subject: toSubjectLine(titleText),
      paragraphs,
      link: { url: appOrigin(process.env) + row.link, label: t('office.notifications.email_link') },
      idempotencyKey: 'notification_email:' + ctx.job.id,
    });
    if (result.status === 'failed')
      throw new JobError(result.errorCode ?? 'email_provider_error', { retry: true });

    const { error: updateError } = await db
      .from('notification')
      .update({ emailed_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('id', row.id)
      .is('emailed_at', null);
    if (updateError) throw updateError;
    return { done: { emailed: true } };
  },
};
