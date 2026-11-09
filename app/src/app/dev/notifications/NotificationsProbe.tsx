'use client';
// EZD-110a Step 21 (vault/plans/EZD-110a.md Decided D25, D26, "Probe result"; Q-0413): one button per
// notification kind (its text is the kind code) that sends the signed-in user that kind through
// POST /api/dev/notifications. Values only: the new id or the error code, and the stored link.
import { useState } from 'react';
import {
  NOTIFICATION_KINDS,
  type NotificationKind,
  type NotificationParams,
} from '../../../lib/notifications/kinds';

export const DEV_SAMPLE_PARAMS: Record<NotificationKind, NotificationParams> = {
  client_response: { action: 'approved', version: 'Version 2' },
  field_conflict: {},
  field_measurements_received: {},
  render_finished: {},
  edit_request: { name: 'Test User' },
  sync_conflict: { count: '2', names: 'Wall 4, Door 2', more: '0' },
  cleanup_due: {},
  render_allowance_refilled: {},
  field_pack_issued: {},
};

type Sent = { notification: { id: string; link: string } };
type Failed = { error: { code: string } };

export function NotificationsProbe({ projectId }: { projectId: string }) {
  const [result, setResult] = useState('');
  const [link, setLink] = useState('');

  const send = async (kind: NotificationKind) => {
    const res = await fetch('/api/dev/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind,
        ...(projectId === '' ? {} : { projectId }),
        params: DEV_SAMPLE_PARAMS[kind],
      }),
    });
    if (res.status === 201) {
      const { notification } = (await res.json()) as Sent;
      setResult(notification.id);
      setLink(notification.link);
      return;
    }
    setLink('');
    const text = await res.text();
    if (text === '') {
      setResult(String(res.status));
      return;
    }
    setResult((JSON.parse(text) as Failed).error.code);
  };

  return (
    <div>
      {NOTIFICATION_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          data-testid={`dev-notify-${kind}`}
          onClick={() => void send(kind)}
        >
          {kind}
        </button>
      ))}
      <p data-testid="dev-notify-result">{result}</p>
      <p data-testid="dev-notify-link">{link}</p>
    </div>
  );
}
