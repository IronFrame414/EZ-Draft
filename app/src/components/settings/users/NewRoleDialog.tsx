'use client';

// EZD-107 (S15 New role, Save as new role, Validation; board S15k states "New role", "Name refused"; AC-EZD-107-1,
// -2): make a custom role. "New role" asks a name and Start from (Nothing (all off) or a preset); "Save as new
// role" asks only the name and uses the person's current switches. A blank name and a name already used in the
// company (ignoring case) are refused under the field, before and after the server answers. The dialog saves at
// once through POST /api/settings/roles (the CustomerDialog pattern) and hands the new role back.
import { Dialog } from 'radix-ui';
import { useState } from 'react';
import { useT } from '../../../lib/messages';
import { useOnline } from '../../../lib/network';
import type { PermissionKey } from '../../../lib/permissions/catalog';
import {
  checkRoleName,
  startFrom,
  takenBy,
  ROLE_NAME_MAX,
  type RoleSummary,
} from '../../../lib/roles/roles';
import touch from '../../../styles/touch.module.css';
import { StateButton } from '../../states/StateButton';
import styles from './Roles.module.css';
import userStyles from './Users.module.css';

export type NewRoleRequest =
  { kind: 'new'; startId: string | null } | { kind: 'from_user'; granted: PermissionKey[] };

type NameError = { kind: 'blank' } | { kind: 'taken'; name: string };

export function NewRoleDialog({
  request,
  roles,
  onClose,
  onCreated,
}: {
  request: NewRoleRequest;
  roles: readonly RoleSummary[];
  onClose: () => void;
  onCreated: (role: RoleSummary) => void;
}) {
  const t = useT();
  const online = useOnline();
  const [name, setName] = useState('');
  const [startId, setStartId] = useState<string | null>(
    request.kind === 'new' ? request.startId : null,
  );
  const [nameError, setNameError] = useState<NameError | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const presets = roles.filter((r) => r.preset !== null);

  const granted = (): PermissionKey[] =>
    request.kind === 'from_user'
      ? request.granted
      : startFrom(presets.find((r) => r.id === startId) ?? null);

  const refuse = (problem: 'blank' | 'taken', stored: string | null) =>
    setNameError(
      problem === 'blank' ? { kind: 'blank' } : { kind: 'taken', name: stored ?? name.trim() },
    );

  const create = async () => {
    const problem = checkRoleName(name, roles);
    if (problem !== null) {
      refuse(problem, takenBy(name, roles));
      return;
    }
    setNameError(null);
    setFailed(false);
    setBusy(true);
    try {
      const res = await fetch('/api/settings/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ name, grantedKeys: granted() }),
      });
      if (res.status === 201) {
        const body = (await res.json()) as { role: RoleSummary };
        onCreated(body.role);
        return;
      }
      if (res.status === 400) {
        const data: unknown = await res.json().catch(() => null);
        const code = (data as { error?: { code?: unknown } } | null)?.error?.code;
        if (code === 'role_name_taken' || code === 'role_name_required') {
          refuse(code === 'role_name_taken' ? 'taken' : 'blank', null);
          return;
        }
      }
      setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const chip = (id: string | null, label: string) => (
    <button
      key={id ?? 'nothing'}
      type="button"
      data-testid={`new-role-start-${id === null ? 'nothing' : (presets.find((p) => p.id === id)?.preset ?? id)}`}
      aria-pressed={startId === id}
      className={`${styles.chip} ${touch.target}${startId === id ? ` ${styles.chipOn}` : ''}`}
      onClick={() => setStartId(id)}
    >
      {label}
    </button>
  );

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          data-testid="new-role-dialog"
          lang={t.language}
          className={styles.content}
          aria-describedby={undefined}
        >
          <div className={styles.dialogBody}>
            <Dialog.Title className={styles.dialogTitle}>
              {t(
                request.kind === 'new' ? 'office.roles.new_role' : 'office.roles.save_as_new_title',
              )}
            </Dialog.Title>
            <div className={styles.dialogField}>
              <div className={styles.labelRow}>
                <label htmlFor="new-role-name">{t('office.roles.name')}</label>
                <span>{t('office.roles.required')}</span>
              </div>
              <input
                id="new-role-name"
                data-testid="new-role-name"
                className={`${styles.input}${nameError ? ` ${styles.inputBad}` : ''}`}
                maxLength={ROLE_NAME_MAX}
                value={name}
                readOnly={!online}
                aria-invalid={nameError !== null}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && online && !busy) void create();
                }}
              />
              {nameError ? (
                <p data-testid="new-role-name-error" role="alert" className={styles.fieldError}>
                  {nameError.kind === 'blank'
                    ? t('office.roles.name_blank')
                    : t('office.roles.name_taken', { name: nameError.name })}
                </p>
              ) : null}
            </div>
            {request.kind === 'new' ? (
              <div className={styles.dialogField}>
                <span className={userStyles.label}>{t('office.roles.start_from')}</span>
                <div className={styles.chips} role="group" data-testid="new-role-start">
                  {chip(null, t('office.roles.start_nothing'))}
                  {presets.map((p) => chip(p.id, p.name))}
                </div>
              </div>
            ) : null}
            {failed ? (
              <p data-testid="new-role-error" role="alert" className={styles.fieldError}>
                {t('office.roles.save_failed')}
              </p>
            ) : null}
          </div>
          <div className={styles.dialogFoot}>
            <StateButton data-testid="new-role-cancel" disabled={busy} onClick={onClose}>
              {t('office.roles.cancel')}
            </StateButton>
            <StateButton
              data-testid="new-role-create"
              variant="primary"
              disabled={busy || !online}
              onClick={() => void create()}
            >
              {t('office.roles.create')}
            </StateButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
