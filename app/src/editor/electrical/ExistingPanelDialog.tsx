'use client';
// EZD-606 (S06 Controls "Existing panel (not in mockup) | ... opens a dialog | Service size, main breaker, panel
// label photo (AI reads brand, rating, spaces; user confirms), existing circuit list (typed or read from directory
// photo; user confirms), existing large appliances (range, dryer, AC, water heater). | Edit model. AI values shown
// for confirmation, never applied silently."; S06 Decisions "AI-read panel label and directory values must be
// confirmed before use"; Q-0769 (no board: built in the style of the nearest approved board, the Send dialog);
// AC-EZD-606-1; vault/build/assumptions.md EZD-606): the Existing panel dialog. A photo read is shown in its own
// block tagged Not confirmed and is not in the model, so not in the calc. Confirm puts its values in the form and
// saves the form at once (one change set); Discard drops it. Save writes the typed values and closes.
import { EXISTING_APPLIANCE_KINDS, type ExistingAppliance } from '@ezdraft/geometry';
import { Dialog } from 'radix-ui';
import { useRef, useState, type ReactElement } from 'react';
import { StateButton } from '../../components/states/StateButton';
import { PHOTO_ACCEPT } from '../../lib/assistant/photo-rules';
import type { DirectoryCircuit, PanelLabel, PanelRead } from '../../lib/electrical/panel-read';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import type { Change, Objects } from '../model/patches';
import {
  confirmDirectory,
  confirmLabel,
  existingPanelChanges,
  existingPanelForm,
  toggleAppliance,
  type ExistingCircuitRow,
  type ExistingPanelCtx,
  type ExistingPanelForm,
  type ExistingPanelProblem,
} from './existing-panel';
import styles from './ExistingPanelDialog.module.css';
import type { PanelPhotoReader } from './panel-read-client';

export type ExistingPanelDialogProps = {
  /** The model now (the store's objects), read when the dialog opens and after each save. */
  getObjects: () => Objects;
  /** The panel the left panel shows; null when the model has none (Save makes Panel A). */
  panelId: string | null;
  ctx: ExistingPanelCtx;
  reader: PanelPhotoReader;
  /** Applies one change set (one undo step). */
  onApply: (changes: Change[]) => void;
  onClose: () => void;
};

type ReadState =
  | { kind: 'idle' }
  | { kind: 'reading'; read: PanelRead }
  | { kind: 'message'; read: PanelRead; key: MessageKey }
  | { kind: 'label'; fileId: string; label: PanelLabel }
  | { kind: 'directory'; circuits: DirectoryCircuit[] };

const PROBLEM: Readonly<Record<ExistingPanelProblem, MessageKey>> = {
  space_taken: 'office.electrical.existing.problem.space_taken',
  space_past_panel: 'office.electrical.existing.problem.space_past_panel',
  no_floor: 'office.electrical.existing.problem.no_floor',
  invalid: 'office.electrical.existing.problem.invalid',
};

/** A whole number above zero, or null for blank or anything else. */
const positive = (text: string): number | null => {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= 1_000_000 ? n : null;
};

export function ExistingPanelDialog({
  getObjects,
  panelId,
  ctx,
  reader,
  onApply,
  onClose,
}: ExistingPanelDialogProps): ReactElement {
  const t = useT();
  const [form, setForm] = useState<ExistingPanelForm>(() =>
    existingPanelForm(getObjects(), panelId),
  );
  const [panel, setPanel] = useState<string | null>(panelId);
  const [read, setRead] = useState<ReadState>({ kind: 'idle' });
  const [problem, setProblem] = useState<ExistingPanelProblem | null>(null);
  const labelInput = useRef<HTMLInputElement>(null);
  const directoryInput = useRef<HTMLInputElement>(null);
  const live = useRef(true);

  const amps = (n: number | null) =>
    n === null
      ? t('office.electrical.existing.not_read')
      : t('office.electrical.existing.amps', { amps: n });

  /** Writes the form as one change set; the panel's id, or null (with the problem shown) when it is refused. */
  const save = (next: ExistingPanelForm): string | null => {
    const r = existingPanelChanges(getObjects(), panel, next, ctx);
    if ('problem' in r) {
      setProblem(r.problem);
      return null;
    }
    setProblem(null);
    if (r.changes.length > 0) onApply(r.changes);
    setPanel(r.panelId);
    return r.panelId;
  };

  const startRead = (which: PanelRead, file: File | undefined) => {
    if (file === undefined) return;
    setRead({ kind: 'reading', read: which });
    void reader(which, file).then((answer) => {
      if (!live.current) return;
      if (answer.status === 'failed') {
        setRead({
          kind: 'message',
          read: which,
          key:
            answer.reason === 'photo'
              ? 'office.electrical.existing.read_photo_problem'
              : answer.reason === 'denied'
                ? 'error.not_authorized'
                : 'office.electrical.existing.read_failed',
        });
        return;
      }
      const out = answer.output;
      if (out.status === 'unreadable') {
        setRead({ kind: 'message', read: which, key: 'office.electrical.existing.unreadable' });
      } else if ('label' in out) {
        setRead({ kind: 'label', fileId: answer.fileId, label: out.label });
      } else {
        setRead({ kind: 'directory', circuits: out.circuits });
      }
    });
  };

  const confirmRead = () => {
    let next: ExistingPanelForm;
    if (read.kind === 'label') next = confirmLabel(form, read.label, read.fileId);
    else if (read.kind === 'directory') next = confirmDirectory(form, read.circuits);
    else return;
    const saved = save(next);
    if (saved === null) {
      setForm(next);
      return;
    }
    // The form re-reads the model, so the rows just added take their circuit ids.
    setForm(existingPanelForm(getObjects(), saved));
    setRead({ kind: 'idle' });
  };

  const setRow = (i: number, patch: Partial<ExistingCircuitRow>) =>
    setForm((f) => ({
      ...f,
      circuits: f.circuits.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    }));

  const nextSpace = () => {
    const taken = new Set(
      form.circuits.flatMap((r) => (r.poles === 2 ? [r.space, r.space + 2] : [r.space])),
    );
    let s = 1;
    while (taken.has(s)) s++;
    return s;
  };

  const ampsField = (
    key: 'serviceSize' | 'mainBreaker' | 'spaces',
    label: MessageKey,
    unit: boolean,
  ) => (
    <label className={styles.field}>
      <span>{t(label)}</span>
      <span className={styles.withUnit}>
        <input
          className={styles.input}
          data-testid={`existing-panel-${key}`}
          inputMode="numeric"
          value={form[key] === null ? '' : String(form[key])}
          onChange={(e) => {
            const v = positive(e.target.value);
            setForm((f) => ({ ...f, [key]: e.target.value.trim() === '' ? null : (v ?? f[key]) }));
          }}
        />
        {unit ? (
          <span className={styles.unit}>{t('office.electrical.existing.amps_unit')}</span>
        ) : null}
      </span>
    </label>
  );

  const reading = read.kind === 'reading';
  const readMessage = (which: PanelRead) =>
    read.kind === 'message' && read.read === which ? (
      <p className={styles.message} role="status" data-testid={`existing-panel-${which}-message`}>
        {t(read.key)}
      </p>
    ) : read.kind === 'reading' && read.read === which ? (
      <p className={styles.message} role="status" data-testid={`existing-panel-${which}-reading`}>
        {t('office.electrical.existing.reading')}
      </p>
    ) : null;

  const readActions = (
    <div className={styles.readActions}>
      <StateButton
        data-testid="existing-panel-read-discard"
        onClick={() => setRead({ kind: 'idle' })}
      >
        {t('office.electrical.existing.discard')}
      </StateButton>
      <StateButton
        variant="primary"
        data-testid="existing-panel-read-confirm"
        onClick={confirmRead}
      >
        {t('office.electrical.existing.confirm')}
      </StateButton>
    </div>
  );

  const appliance = (kind: ExistingAppliance['kind']) =>
    form.appliances.find((a) => a.kind === kind);

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) {
          live.current = false;
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          data-testid="existing-panel-dialog"
          lang={t.language}
          className={styles.content}
          aria-describedby={undefined}
        >
          <div className={styles.body}>
            <Dialog.Title className={styles.dialogTitle}>
              {t('office.electrical.existing.title')}
            </Dialog.Title>
            <div className={styles.grid}>
              {ampsField('serviceSize', 'office.electrical.existing.service_size', true)}
              {ampsField('mainBreaker', 'office.electrical.existing.main_breaker', true)}
              {ampsField('spaces', 'office.electrical.existing.spaces', false)}
              <label className={styles.field}>
                <span>{t('office.electrical.existing.brand')}</span>
                <input
                  className={styles.input}
                  data-testid="existing-panel-brand"
                  maxLength={80}
                  value={form.brand ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, brand: e.target.value === '' ? null : e.target.value }))
                  }
                />
              </label>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionHead}>
                <StateButton
                  data-testid="existing-panel-read-label"
                  disabled={reading}
                  onClick={() => labelInput.current?.click()}
                >
                  {t('office.electrical.existing.read_label')}
                </StateButton>
                {form.labelPhoto !== null ? (
                  <span className={styles.note} data-testid="existing-panel-label-photo">
                    {t('office.electrical.existing.label_photo_saved')}
                  </span>
                ) : null}
                <input
                  ref={labelInput}
                  type="file"
                  hidden
                  accept={PHOTO_ACCEPT}
                  data-testid="existing-panel-label-file"
                  onChange={(e) => {
                    startRead('label', e.currentTarget.files?.[0]);
                    e.currentTarget.value = '';
                  }}
                />
              </div>
              {readMessage('label')}
              {read.kind === 'label' ? (
                <div
                  className={styles.read}
                  data-testid="existing-panel-label-read"
                  data-confirmed="false"
                >
                  <div className={styles.readHead}>
                    <span>{t('office.electrical.existing.from_label')}</span>
                    <span className={styles.tag} data-testid="existing-panel-unconfirmed">
                      {t('office.electrical.existing.unconfirmed')}
                    </span>
                  </div>
                  <dl className={styles.values}>
                    <dt>{t('office.electrical.existing.brand')}</dt>
                    <dd data-testid="existing-panel-read-brand">
                      {read.label.brand ?? t('office.electrical.existing.not_read')}
                    </dd>
                    <dt>{t('office.electrical.existing.rating')}</dt>
                    <dd data-testid="existing-panel-read-rating">{amps(read.label.rating)}</dd>
                    <dt>{t('office.electrical.existing.spaces')}</dt>
                    <dd data-testid="existing-panel-read-spaces">
                      {read.label.spaces ?? t('office.electrical.existing.not_read')}
                    </dd>
                  </dl>
                  {readActions}
                </div>
              ) : null}
            </div>

            <div className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionTitle}>
                  {t('office.electrical.existing.circuits')}
                </span>
                <StateButton
                  data-testid="existing-panel-read-directory"
                  disabled={reading}
                  onClick={() => directoryInput.current?.click()}
                >
                  {t('office.electrical.existing.read_directory')}
                </StateButton>
                <input
                  ref={directoryInput}
                  type="file"
                  hidden
                  accept={PHOTO_ACCEPT}
                  data-testid="existing-panel-directory-file"
                  onChange={(e) => {
                    startRead('directory', e.currentTarget.files?.[0]);
                    e.currentTarget.value = '';
                  }}
                />
              </div>
              {readMessage('directory')}
              {read.kind === 'directory' ? (
                <div
                  className={styles.read}
                  data-testid="existing-panel-directory-read"
                  data-confirmed="false"
                >
                  <div className={styles.readHead}>
                    <span>{t('office.electrical.existing.from_directory')}</span>
                    <span className={styles.tag}>
                      {t('office.electrical.existing.unconfirmed')}
                    </span>
                  </div>
                  <ul className={styles.readList}>
                    {read.circuits.map((c) => (
                      <li key={c.space} data-testid="existing-panel-directory-line">
                        {`${c.poles === 2 ? `${c.space}-${c.space + 2}` : c.space} · ${c.name} · ${t(
                          'office.electrical.existing.amps',
                          { amps: c.breaker },
                        )}`}
                      </li>
                    ))}
                  </ul>
                  {readActions}
                </div>
              ) : null}
              {form.circuits.length === 0 ? (
                <p className={styles.note} data-testid="existing-panel-circuits-none">
                  {t('office.electrical.existing.circuits_none')}
                </p>
              ) : (
                <div className={styles.rows}>
                  {form.circuits.map((r, i) => (
                    <div
                      key={r.id ?? `new-${i}`}
                      className={styles.row}
                      data-testid="existing-panel-circuit"
                    >
                      <input
                        className={`${styles.input} ${styles.space}`}
                        aria-label={t('office.electrical.existing.space')}
                        data-testid="existing-panel-circuit-space"
                        inputMode="numeric"
                        value={String(r.space)}
                        onChange={(e) => {
                          const v = positive(e.target.value);
                          if (v !== null) setRow(i, { space: v });
                        }}
                      />
                      <input
                        className={styles.input}
                        aria-label={t('office.electrical.existing.name')}
                        data-testid="existing-panel-circuit-name"
                        maxLength={80}
                        value={r.name}
                        onChange={(e) => setRow(i, { name: e.target.value })}
                      />
                      <input
                        className={`${styles.input} ${styles.space}`}
                        aria-label={t('office.electrical.existing.breaker')}
                        data-testid="existing-panel-circuit-breaker"
                        inputMode="numeric"
                        value={String(r.breaker)}
                        onChange={(e) => {
                          const v = positive(e.target.value);
                          if (v !== null) setRow(i, { breaker: v });
                        }}
                      />
                      <select
                        className={styles.input}
                        aria-label={t('office.electrical.existing.poles')}
                        data-testid="existing-panel-circuit-poles"
                        value={r.poles}
                        onChange={(e) => setRow(i, { poles: e.target.value === '2' ? 2 : 1 })}
                      >
                        <option value={1}>{t('office.electrical.circuit.one_pole')}</option>
                        <option value={2}>{t('office.electrical.circuit.two_pole')}</option>
                      </select>
                      <StateButton
                        data-testid="existing-panel-circuit-remove"
                        onClick={() =>
                          setForm((f) => ({ ...f, circuits: f.circuits.filter((_, j) => j !== i) }))
                        }
                      >
                        {t('office.electrical.existing.remove')}
                      </StateButton>
                    </div>
                  ))}
                </div>
              )}
              <StateButton
                data-testid="existing-panel-add-circuit"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    circuits: [
                      ...f.circuits,
                      { id: null, space: nextSpace(), name: '', breaker: 20, poles: 1 },
                    ],
                  }))
                }
              >
                {t('office.electrical.existing.add_circuit')}
              </StateButton>
            </div>

            <div className={styles.section}>
              <span className={styles.sectionTitle}>
                {t('office.electrical.existing.appliances')}
              </span>
              <div className={styles.rows}>
                {EXISTING_APPLIANCE_KINDS.map((kind) => {
                  const a = appliance(kind);
                  return (
                    <div key={kind} className={styles.row}>
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          data-testid={`existing-panel-appliance-${kind}`}
                          checked={a !== undefined}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              appliances: toggleAppliance(f.appliances, kind, e.target.checked),
                            }))
                          }
                        />
                        <span>{t(`office.electrical.existing.appliance.${kind}`)}</span>
                      </label>
                      {a !== undefined ? (
                        <span className={styles.withUnit}>
                          <input
                            className={`${styles.input} ${styles.va}`}
                            aria-label={t('office.electrical.existing.va')}
                            title={t('office.electrical.existing.va_hint')}
                            placeholder={t('office.electrical.existing.va_hint')}
                            data-testid={`existing-panel-appliance-${kind}-va`}
                            inputMode="numeric"
                            value={a.va === null ? '' : String(a.va)}
                            onChange={(e) => {
                              const v = positive(e.target.value);
                              if (e.target.value.trim() !== '' && v === null) return;
                              setForm((f) => ({
                                ...f,
                                appliances: f.appliances.map((x) =>
                                  x.kind === kind ? { ...x, va: v } : x,
                                ),
                              }));
                            }}
                          />
                          <span className={styles.unit}>{t('office.electrical.existing.va')}</span>
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            {problem !== null ? (
              <p className={styles.error} role="alert" data-testid="existing-panel-problem">
                {t(PROBLEM[problem])}
              </p>
            ) : null}
          </div>
          <div className={styles.footer}>
            <span className={styles.footerSpacer} />
            <StateButton
              data-testid="existing-panel-cancel"
              onClick={() => {
                live.current = false;
                onClose();
              }}
            >
              {t('common.cancel')}
            </StateButton>
            <StateButton
              variant="primary"
              data-testid="existing-panel-save"
              disabled={reading}
              onClick={() => {
                if (save(form) !== null) {
                  live.current = false;
                  onClose();
                }
              }}
            >
              {t('office.electrical.existing.save')}
            </StateButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
