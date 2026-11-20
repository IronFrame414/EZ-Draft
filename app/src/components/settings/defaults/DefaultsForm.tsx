'use client';

// EZD-116 (S15d; board S15dDefaults; Q-0697 decisions 03 "Defaults data", 05 "Settings → Defaults"; ARCH
// Settings shell and Unsaved edits page contracts): the Settings > Defaults page body. Rows come from the one
// registry in the board's three columns; no Keyboard shortcuts card until EZD-222 (Q-0226). An empty row with
// no registry default reads "Not set". Each edited value is checked on its row (S15d Validation; Q-0561;
// Q-0706); a refused row keeps Save off, so nothing saves. Save writes only the edited keys.
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, type ChangeEvent } from 'react';
import {
  DEFAULTS_REGISTRY,
  DEFAULT_COLUMNS,
  GROUP_LABEL,
  type DefaultGroup,
  type DefaultRow,
} from '../../../lib/defaults/registry';
import {
  crossCheck,
  effectiveDefaults,
  formValueOf,
  parseFormValue,
  applyChanges,
  type Changes,
  type FormValue,
  type StoredDefaults,
} from '../../../lib/defaults/values';
import { useT } from '../../../lib/messages';
import { useOnline } from '../../../lib/network';
import type { MessageKey } from '../../../server/messages/catalog';
import { Icon } from '../../icon/Icon';
import { InlineError } from '../../states/InlineError';
import { OfflineBanner } from '../../states/OfflineBanner';
import { StateButton } from '../../states/StateButton';
import { SettingsMain, useSettingsStatus, type SettingsStatusEntry } from '../SettingsShell';
import { useSettingsDraft, useUnsavedChanges } from '../unsaved-changes';
import styles from './DefaultsForm.module.css';

export type DefaultsForm = Record<string, FormValue>;

// A choice value as a message key part (KEY_PATTERN: lower case, digits and _).
const keyPart = (v: string) => v.replace(/[^a-z0-9]+/g, '_');

const EDITABLE = DEFAULTS_REGISTRY.filter((r) => r.type !== 'fixed' && r.type !== 'values');
const ROWS_BY_GROUP = new Map<DefaultGroup, DefaultRow[]>();
for (const r of DEFAULTS_REGISTRY) {
  ROWS_BY_GROUP.set(r.group, [...(ROWS_BY_GROUP.get(r.group) ?? []), r]);
}
const TEXT_TYPES = new Set(['length', 'length_choice', 'percent', 'minutes', 'days', 'count']);
const UNIT_KEY: Partial<Record<string, MessageKey>> = {
  days: 'office.defaults.unit.days',
  min: 'office.defaults.unit.min',
  '%': 'office.defaults.unit.percent',
  MB: 'office.defaults.unit.mb',
};
const GROUP_NOTE: Partial<Record<DefaultGroup, MessageKey>> = {
  units: 'office.defaults.fixed_note',
  waste: 'office.defaults.per_project_note',
};

export function formOf(stored: StoredDefaults): DefaultsForm {
  const eff = effectiveDefaults(stored);
  const out: DefaultsForm = {};
  for (const r of EDITABLE) out[r.key] = formValueOf(r, eff[r.key]);
  return out;
}

const same = (a: FormValue | undefined, b: FormValue | undefined) =>
  JSON.stringify(a) === JSON.stringify(b);

// The edited keys with their values and the refusals on their rows.
export function checkForm(
  saved: StoredDefaults,
  savedForm: DefaultsForm,
  form: DefaultsForm,
): { changes: Changes; errors: Record<string, MessageKey> } {
  const changes: Changes = {};
  const errors: Record<string, MessageKey> = {};
  for (const r of EDITABLE) {
    if (same(form[r.key], savedForm[r.key])) continue;
    const p = parseFormValue(r, form[r.key]);
    if (p.ok) changes[r.key] = p.value;
    else errors[r.key] = p.messageKey;
  }
  if (Object.keys(errors).length === 0) {
    Object.assign(errors, crossCheck(effectiveDefaults(applyChanges(saved, changes))));
  }
  return { changes, errors };
}

async function fieldsOf(res: Response): Promise<Record<string, MessageKey> | null> {
  const body: unknown = await res.json().catch(() => null);
  const fields = (body as { error?: { fields?: unknown } } | null)?.error?.fields;
  return fields && typeof fields === 'object' ? (fields as Record<string, MessageKey>) : null;
}

export function DefaultsPage({ initial }: { initial: StoredDefaults }) {
  const t = useT();
  const router = useRouter();
  const online = useOnline();

  const [saved, setSaved] = useState<StoredDefaults>(initial);
  const savedForm = useMemo(() => formOf(saved), [saved]);
  const [form, setForm] = useState<DefaultsForm>(savedForm);
  const [serverErrors, setServerErrors] = useState<Record<string, MessageKey>>({});
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');

  const { changes, errors: localErrors } = useMemo(
    () => checkForm(saved, savedForm, form),
    [saved, savedForm, form],
  );
  const changedKeys = EDITABLE.filter((r) => !same(form[r.key], savedForm[r.key])).map((r) => r.key);
  const dirty = changedKeys.length > 0;
  const errors = { ...serverErrors, ...localErrors };
  const hasErrors = Object.keys(localErrors).length > 0;

  const draft = useMemo<DefaultsForm | null>(() => (dirty ? form : null), [dirty, form]);
  const restore = useCallback((d: DefaultsForm) => {
    setForm((f) => ({ ...f, ...d }));
  }, []);
  useSettingsDraft<DefaultsForm>('defaults', draft, restore);

  const save = useCallback(async (): Promise<boolean> => {
    if (Object.keys(localErrors).length > 0) return false;
    setSaving(true);
    setSaveFailed(false);
    setServerErrors({});
    try {
      const res = await fetch('/api/settings/defaults', {
        method: 'PATCH',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ changes }),
      });
      if (res.status === 200) {
        const body = (await res.json()) as { stored: StoredDefaults };
        setSaved(body.stored);
        setForm(formOf(body.stored));
        router.refresh();
        return true;
      }
      if (res.status === 400) {
        const fields = await fieldsOf(res);
        if (fields && Object.keys(fields).length > 0) {
          setServerErrors(fields);
          return false;
        }
      }
      setSaveFailed(true);
      return false;
    } catch {
      setSaveFailed(true);
      return false;
    } finally {
      setSaving(false);
    }
  }, [changes, localErrors, router]);

  useUnsavedChanges(dirty, save);

  const discard = () => {
    setForm(savedForm);
    setServerErrors({});
    setSaveFailed(false);
  };

  const notSetCount = useMemo(() => {
    const eff = effectiveDefaults(saved);
    return DEFAULTS_REGISTRY.filter((r) => r.type !== 'fixed' && eff[r.key] === null).length;
  }, [saved]);
  const statusItems = useMemo<readonly SettingsStatusEntry[]>(
    () => [
      { id: 'units', label: 'office.defaults.status_units', value: t('office.defaults.units_value') },
      {
        id: 'not_set',
        label: 'office.defaults.status_not_set',
        value: t('office.defaults.status_not_set_value', { count: notSetCount }),
      },
    ],
    [t, notSetCount],
  );
  useSettingsStatus(statusItems);

  const readOnly = !online;
  const q = query.trim().toLowerCase();
  const shown = (r: DefaultRow) => q === '' || t(r.label).toLowerCase().includes(q);
  const set = (key: string, value: FormValue) => {
    setServerErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
    setForm((f) => ({ ...f, [key]: value }));
  };

  const inputClass = (key: string) =>
    [styles.input, errors[key] ? styles.inputError : '', readOnly ? styles.offline : '']
      .filter(Boolean)
      .join(' ');

  const textInput = (key: string, value: string, onChange: (v: string) => void, testId: string, label: string) => (
    <input
      data-testid={testId}
      aria-label={label}
      aria-invalid={errors[key] ? true : undefined}
      className={inputClass(key)}
      value={value}
      placeholder={t('office.defaults.not_set')}
      readOnly={readOnly}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
    />
  );

  const control = (r: DefaultRow) => {
    const label = t(r.label);
    const v = form[r.key];
    if (r.type === 'fixed') {
      return <span className={styles.mono}>{t('office.defaults.units_value')}</span>;
    }
    if (r.type === 'values') {
      return (
        <span data-testid={`defaults-not-set-${r.key}`} className={styles.notSet}>
          {t('office.defaults.not_set')}
        </span>
      );
    }
    if (TEXT_TYPES.has(r.type)) {
      const unit = r.unit ? UNIT_KEY[r.unit] : undefined;
      return (
        <>
          {textInput(r.key, v as string, (s) => set(r.key, s), `defaults-input-${r.key}`, label)}
          {unit ? <span className={styles.unit}>{t(unit)}</span> : null}
          {r.key === 'overhang_against_wall' ? (
            <span className={styles.unit}>{t('office.defaults.splash')}</span>
          ) : null}
        </>
      );
    }
    if (r.type === 'length_range') {
      const range = v as { min: string; max: string };
      return (
        <>
          {textInput(r.key, range.min, (s) => set(r.key, { ...range, min: s }), `defaults-input-${r.key}-min`, label)}
          <span className={styles.unit}>{t('office.defaults.range_to')}</span>
          {textInput(r.key, range.max, (s) => set(r.key, { ...range, max: s }), `defaults-input-${r.key}-max`, label)}
        </>
      );
    }
    if (r.type === 'choice') {
      return (
        <div className={styles.segment} role="group" aria-label={label} data-testid={`defaults-input-${r.key}`}>
          {(r.choices ?? []).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={v === c}
              disabled={readOnly}
              onClick={() => set(r.key, c)}
            >
              {t(`office.defaults.choice.${keyPart(c)}` as MessageKey)}
            </button>
          ))}
        </div>
      );
    }
    if (r.type === 'switch') {
      return (
        <button
          type="button"
          role="switch"
          aria-checked={v === true}
          aria-label={label}
          data-testid={`defaults-input-${r.key}`}
          className={styles.chip}
          disabled={readOnly}
          onClick={() => set(r.key, v !== true)}
        >
          {v === true ? t('office.defaults.on') : t('office.defaults.off')}
        </button>
      );
    }
    // scales
    const list = v as readonly string[];
    return (
      <div className={styles.chips} role="group" aria-label={label} data-testid={`defaults-input-${r.key}`}>
        {(r.choices ?? []).map((c) => (
          <button
            key={c}
            type="button"
            className={styles.chip}
            aria-pressed={list.includes(c)}
            disabled={readOnly}
            onClick={() =>
              set(
                r.key,
                list.includes(c)
                  ? list.filter((x) => x !== c)
                  : (r.choices ?? []).filter((x) => x === c || list.includes(x)),
              )
            }
          >
            {t(`office.defaults.scale.${keyPart(c)}` as MessageKey)}
          </button>
        ))}
      </div>
    );
  };

  const groupView = (g: DefaultGroup) => {
    const rows = (ROWS_BY_GROUP.get(g) ?? []).filter(shown);
    if (rows.length === 0) return null;
    const note = GROUP_NOTE[g];
    return (
      <section key={g} className={styles.group} data-testid="defaults-group" data-group={g}>
        <h2>
          {t(GROUP_LABEL[g])}
          {note ? <span className={styles.groupNote}>{t(note)}</span> : null}
        </h2>
        {rows.map((r) => (
          <div key={r.key}>
            <div className={styles.row} data-testid="defaults-row" data-key={r.key}>
              <div className={styles.rowText}>
                <span>{t(r.label)}</span>
                {r.hint ? <span className={styles.hint}>{t(r.hint)}</span> : null}
              </div>
              <div className={styles.control}>{control(r)}</div>
            </div>
            {errors[r.key] ? (
              <div data-testid="defaults-row-error" data-key={r.key} role="alert" className={styles.rowError}>
                {t(errors[r.key])}
              </div>
            ) : null}
          </div>
        ))}
      </section>
    );
  };

  const columns = DEFAULT_COLUMNS.map((col) => col.map(groupView));
  const anyShown = columns.some((col) => col.some((g) => g !== null));
  const buttonsOff = !dirty || saving || !online;

  const search = (
    <div className={styles.search}>
      <Icon name="search" size={17} />
      <input
        data-testid="defaults-search"
        className={styles.searchInput}
        placeholder={t('office.defaults.search')}
        aria-label={t('office.defaults.search')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query !== '' ? (
        <button
          type="button"
          data-testid="defaults-search-clear"
          aria-label={t('office.defaults.search_clear')}
          className={styles.searchClear}
          onClick={() => setQuery('')}
        >
          <Icon name="close" size={16} />
        </button>
      ) : null}
    </div>
  );

  return (
    <SettingsMain
      section="defaults"
      title="office.settings.section.defaults"
      subtitle="office.defaults.subtitle"
      actions={search}
      flush
    >
      <div data-testid="defaults-form" className={styles.form}>
        <div className={styles.body}>
          {online ? null : (
            <div data-testid="defaults-offline">
              <OfflineBanner message="office.defaults.offline" />
            </div>
          )}
          {saveFailed ? (
            <div data-testid="defaults-save-error">
              <InlineError message="office.defaults.save_failed" onRetry={() => void save()} />
            </div>
          ) : null}
          {anyShown ? (
            <div className={styles.columns}>
              {columns.map((col, i) => (
                <div key={i} className={styles.column}>
                  {col}
                </div>
              ))}
            </div>
          ) : (
            <p data-testid="defaults-no-match" className={styles.noMatch}>
              {t('office.defaults.no_match')}
            </p>
          )}
        </div>
        <div className={styles.footer}>
          {dirty ? (
            <span data-testid="defaults-unsaved" className={styles.unsaved}>
              <span aria-hidden="true" className={styles.dot} />
              {t('office.defaults.unsaved', {
                count: changedKeys.length,
                fields: changedKeys
                  .map((k) => t(DEFAULTS_REGISTRY.find((r) => r.key === k)!.label))
                  .join(', '),
              })}
            </span>
          ) : null}
          <span className={styles.lengthsHint}>{t('office.defaults.lengths_hint')}</span>
          <span className={styles.spacer} />
          <StateButton
            className={styles.plainButton}
            data-testid="defaults-discard"
            disabled={buttonsOff}
            onClick={discard}
          >
            {t('office.defaults.discard')}
          </StateButton>
          <StateButton
            variant="primary"
            className={styles.saveButton}
            data-testid="defaults-save"
            disabled={buttonsOff || hasErrors}
            onClick={() => void save()}
          >
            {t('office.defaults.save')}
          </StateButton>
        </div>
      </div>
    </SettingsMain>
  );
}

export function DefaultsLoadError() {
  const router = useRouter();
  return (
    <SettingsMain section="defaults" title="office.settings.section.defaults">
      <div data-testid="defaults-load-error">
        <InlineError message="office.defaults.load_failed" onRetry={() => router.refresh()} />
      </div>
    </SettingsMain>
  );
}
