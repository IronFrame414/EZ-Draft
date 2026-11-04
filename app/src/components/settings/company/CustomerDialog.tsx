'use client';

// EZD-113 Step 15 (vault/plans/EZD-113.md Decided "Dialog", "Dialog save", "Archive / Restore", "Offline";
// S15a Customers; Q-0227; Q-0228): add or edit one customer. The dialog saves at once through its route;
// archive and restore need no confirm (they are undoable). There is no delete (Q-0227).
import { Dialog } from 'radix-ui';
import { useState } from 'react';
import {
  checkCustomerDraft,
  type CustomerDraft,
  type CustomerRow,
} from '../../../lib/customers/customers';
import { useT } from '../../../lib/messages';
import { useOnline } from '../../../lib/network';
import type { MessageKey } from '../../../server/messages/catalog';
import { StateButton } from '../../states/StateButton';
import styles from './Customers.module.css';
import offline from './offline-input.module.css';

export type CustomerDialogProps = {
  customer: CustomerRow | null;
  onClose: () => void;
  onDone: () => void;
};

type FieldErrors = { name?: MessageKey; email?: MessageKey };

const FIELD_ERRORS: Record<string, { field: 'name' | 'email'; key: MessageKey }> = {
  customer_name_required: { field: 'name', key: 'error.customer_name_required' },
  customer_email_required: { field: 'email', key: 'error.customer_email_required' },
  invalid_email: { field: 'email', key: 'error.invalid_email' },
  customer_email_taken: { field: 'email', key: 'error.customer_email_taken' },
};

const FIELDS = [
  { id: 'name', label: 'office.customers.field_name', type: 'text' },
  { id: 'email', label: 'office.customers.field_email', type: 'email' },
  { id: 'phone', label: 'office.customers.field_phone', type: 'text' },
  { id: 'address', label: 'office.customers.field_address', type: 'text' },
] as const satisfies readonly { id: keyof CustomerDraft; label: MessageKey; type: string }[];

function draftOf(customer: CustomerRow | null): CustomerDraft {
  return {
    name: customer?.name ?? '',
    email: customer?.email ?? '',
    phone: customer?.phone ?? '',
    address: customer?.address ?? '',
  };
}

export function CustomerDialog({ customer, onClose, onDone }: CustomerDialogProps) {
  const t = useT();
  const online = useOnline();
  const [draft, setDraft] = useState<CustomerDraft>(() => draftOf(customer));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const archived = customer !== null && customer.archivedAt !== null;

  const send = async (body: unknown) => {
    setBusy(true);
    setSaveError(null);
    try {
      const res = await fetch(
        customer === null ? '/api/settings/customers' : `/api/settings/customers/${customer.id}`,
        {
          method: customer === null ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(body),
        },
      );
      if (res.status === 200 || res.status === 201) {
        onDone();
        return;
      }
      if (res.status === 404) {
        setSaveError('error.customer_not_found');
        return;
      }
      if (res.status === 400) {
        const data: unknown = await res.json().catch(() => null);
        const code = (data as { error?: { code?: unknown } } | null)?.error?.code;
        const mapped = typeof code === 'string' ? FIELD_ERRORS[code] : undefined;
        if (mapped) {
          setFieldErrors({ [mapped.field]: mapped.key });
          return;
        }
      }
      setSaveError('office.customers.save_failed');
    } catch {
      setSaveError('office.customers.save_failed');
    } finally {
      setBusy(false);
    }
  };

  const onSave = () => {
    const problems = checkCustomerDraft(draft);
    const errors: FieldErrors = {};
    if (problems.name) errors.name = `error.${problems.name}`;
    if (problems.email) errors.email = `error.${problems.email}`;
    setFieldErrors(errors);
    if (errors.name || errors.email) return;
    void send(draft);
  };

  const disabled = busy || !online;

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
          data-testid="customer-dialog"
          lang={t.language}
          className={styles.content}
          aria-describedby={undefined}
        >
          <div className={styles.body}>
            <Dialog.Title className={styles.dialogTitle}>
              {t(
                customer === null ? 'office.customers.dialog_add' : 'office.customers.dialog_edit',
              )}
            </Dialog.Title>
            <div className={styles.fields}>
              {FIELDS.map((f) => {
                const error = f.id === 'name' || f.id === 'email' ? fieldErrors[f.id] : undefined;
                return (
                  <label key={f.id} className={styles.field}>
                    {t(f.label)}
                    {/* EZD-242 (S15a States "offline read-only"; Q-0360 (c)): offline fields are read-only and look it. */}
                    <input
                      data-testid={`customer-field-${f.id}`}
                      className={online ? styles.input : `${styles.input} ${offline.offline}`}
                      type={f.type}
                      value={draft[f.id]}
                      readOnly={archived || !online}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDraft((d) => ({ ...d, [f.id]: value }));
                      }}
                    />
                    {error ? (
                      <p
                        data-testid="customer-field-error"
                        data-field={f.id}
                        role="alert"
                        className={styles.fieldError}
                      >
                        {t(error)}
                      </p>
                    ) : null}
                  </label>
                );
              })}
            </div>
            {saveError ? (
              <p data-testid="customer-save-error" role="alert" className={styles.fieldError}>
                {t(saveError)}
              </p>
            ) : null}
          </div>
          <div className={styles.footer}>
            {customer !== null && !archived ? (
              <StateButton
                data-testid="customer-archive"
                disabled={disabled}
                onClick={() => void send({ archived: true })}
              >
                {t('office.customers.archive')}
              </StateButton>
            ) : null}
            {archived ? (
              <StateButton
                data-testid="customer-restore"
                disabled={disabled}
                onClick={() => void send({ archived: false })}
              >
                {t('office.customers.restore')}
              </StateButton>
            ) : null}
            <span className={styles.footerSpacer} />
            <StateButton data-testid="customer-cancel" disabled={busy} onClick={onClose}>
              {t('common.cancel')}
            </StateButton>
            {archived ? null : (
              <StateButton
                data-testid="customer-save"
                variant="primary"
                className={styles.saveButton}
                disabled={disabled}
                onClick={onSave}
              >
                {t('office.customers.save')}
              </StateButton>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
