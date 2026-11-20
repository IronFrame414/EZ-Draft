'use client';

// EZD-1102 (S15f; board S15fRender; Q-0210; 13b R2; AC-EZD-1102-1; ARCH Settings shell and Unsaved edits page
// contracts): the Settings > Render models page body. Tiers (Fast, Standard, Photoreal: model select, output,
// cost per render, where it runs) and the Render allowance (amount, auto-refill, used since the last refill).
// Save in the footer writes both; it is off with no edits and refused until every tier has a model. Dollar
// figures come from the server only with See company costs; without it the cost column and the allowance card
// are not drawn. The Local render worker card is EZD-1104a; the refilled banner, refill history and "This
// period" are EZD-1117 (vault/build/assumptions.md EZD-1102). Offline: read-only.
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import {
  RENDER_TIERS,
  formatDollars,
  isDollars,
  modelByKey,
  outputLabel,
  tierHint,
  tierLabel,
  type RenderModelsPatch,
  type RenderModelsSettings,
  type RenderTier,
} from '../../../lib/render-settings/models';
import { useT } from '../../../lib/messages';
import type { MessageKey } from '../../../server/messages/catalog';
import { useOnline } from '../../../lib/network';
import type { IconName } from '../../icon/icon-names.generated';
import { Icon } from '../../icon/Icon';
import { InlineError } from '../../states/InlineError';
import { OfflineBanner } from '../../states/OfflineBanner';
import { StateButton } from '../../states/StateButton';
import { SettingsMain, useSettingsStatus, type SettingsStatusEntry } from '../SettingsShell';
import { useUnsavedChanges } from '../unsaved-changes';
import styles from './RenderModelsForm.module.css';

const TIER_ICONS: Record<RenderTier, IconName> = {
  fast: 'auto_awesome',
  standard: 'add_photo_alternate',
  photoreal: 'photo_camera',
};

type TierForm = { model: string; cost: string };
export type RenderForm = {
  tiers: Record<RenderTier, TierForm>;
  amount: string;
  refill: string;
};

const dollarsText = (v: number | null | undefined) => (v === null || v === undefined ? '' : v.toFixed(2));

export function formOf(s: RenderModelsSettings): RenderForm {
  const tiers = {} as Record<RenderTier, TierForm>;
  for (const tier of RENDER_TIERS) {
    const row = s.tiers.find((t) => t.tier === tier);
    tiers[tier] = { model: row?.model ?? '', cost: dollarsText(row?.costUsdPerRender) };
  }
  return {
    tiers,
    amount: dollarsText(s.allowance?.amountUsd),
    refill: dollarsText(s.allowance?.refillAmountUsd),
  };
}

// A typed dollar field: empty is null; otherwise digits with up to two decimals.
export function parseDollarsText(text: string): number | null | 'invalid' {
  const v = text.trim().replace(/^\$/, '').replace(/,/g, '');
  if (v === '') return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(v)) return 'invalid';
  return Number(v);
}

export type ChangeKey = `${RenderTier}_model` | `${RenderTier}_cost` | 'amount' | 'refill';

// What differs from the saved settings, in page order.
export function changedKeys(saved: RenderForm, form: RenderForm): ChangeKey[] {
  const keys: ChangeKey[] = [];
  for (const tier of RENDER_TIERS) {
    if (form.tiers[tier].model !== saved.tiers[tier].model) keys.push(`${tier}_model`);
    if (parseDollarsText(form.tiers[tier].cost) !== parseDollarsText(saved.tiers[tier].cost)) {
      keys.push(`${tier}_cost`);
    }
  }
  if (parseDollarsText(form.amount) !== parseDollarsText(saved.amount)) keys.push('amount');
  if (parseDollarsText(form.refill) !== parseDollarsText(saved.refill)) keys.push('refill');
  return keys;
}

export type FormProblem = 'tier_model_required' | 'cost_invalid' | 'allowance_invalid';

// The PATCH body, or the first problem that stops Save (AC-EZD-1102-1: every tier needs a model).
export function patchOf(
  form: RenderForm,
  costs: boolean,
  allowanceChanged: boolean,
): { ok: true; patch: RenderModelsPatch } | { ok: false; problem: FormProblem } {
  if (RENDER_TIERS.some((t) => form.tiers[t].model === '')) {
    return { ok: false, problem: 'tier_model_required' };
  }
  const tiers: RenderModelsPatch['tiers'] = [];
  for (const tier of RENDER_TIERS) {
    const item: RenderModelsPatch['tiers'][number] = { tier, model: form.tiers[tier].model };
    if (costs) {
      const c = parseDollarsText(form.tiers[tier].cost);
      if (c === 'invalid') return { ok: false, problem: 'cost_invalid' };
      item.costUsdPerRender = c;
    }
    tiers.push(item);
  }
  const patch: RenderModelsPatch = { tiers };
  if (costs && allowanceChanged) {
    const amount = parseDollarsText(form.amount);
    const refill = parseDollarsText(form.refill);
    if (!isDollars(amount, true) || !isDollars(refill, true)) {
      return { ok: false, problem: 'allowance_invalid' };
    }
    patch.allowance = { amountUsd: amount, refillAmountUsd: refill };
  }
  return { ok: true, patch };
}

const CHANGE_LABELS: Record<ChangeKey, MessageKey> = {
  fast_model: 'office.render_models.change.fast_model',
  standard_model: 'office.render_models.change.standard_model',
  photoreal_model: 'office.render_models.change.photoreal_model',
  fast_cost: 'office.render_models.change.fast_cost',
  standard_cost: 'office.render_models.change.standard_cost',
  photoreal_cost: 'office.render_models.change.photoreal_cost',
  amount: 'office.render_models.change.amount',
  refill: 'office.render_models.change.refill',
};

const PROBLEM_MESSAGES = {
  tier_model_required: 'office.render_models.tier_model_required',
  cost_invalid: 'office.render_models.cost_invalid',
  allowance_invalid: 'office.render_models.allowance_invalid',
} as const;

export function RenderModelsPage({
  initial,
  fetchImpl,
}: {
  initial: RenderModelsSettings;
  fetchImpl?: typeof fetch;
}) {
  const t = useT();
  const router = useRouter();
  const online = useOnline();
  const [saved, setSaved] = useState<RenderModelsSettings>(initial);
  const savedForm = useMemo(() => formOf(saved), [saved]);
  const [form, setForm] = useState<RenderForm>(() => formOf(initial));
  const [problem, setProblem] = useState<FormProblem | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const costs = saved.costs;
  const changes = changedKeys(savedForm, form);
  const dirty = changes.length > 0;
  const readOnly = !online;

  const save = useCallback(async (): Promise<boolean> => {
    const now = changedKeys(savedForm, form);
    if (now.length === 0) return true;
    const allowanceChanged = now.includes('amount') || now.includes('refill');
    const built = patchOf(form, costs, allowanceChanged);
    if (!built.ok) {
      setProblem(built.problem);
      return false;
    }
    setProblem(null);
    setSaving(true);
    setSaveFailed(false);
    try {
      const res = await (fetchImpl ?? fetch)('/api/settings/render-models', {
        method: 'PATCH',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(built.patch),
      });
      if (res.status === 200) {
        const body = (await res.json()) as RenderModelsSettings;
        setSaved(body);
        setForm(formOf(body));
        router.refresh();
        return true;
      }
      if (res.status === 400) {
        const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
        if (body?.error?.code === 'tier_model_required') {
          setProblem('tier_model_required');
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
  }, [savedForm, form, costs, fetchImpl, router]);

  useUnsavedChanges(dirty, save);

  const discard = () => {
    setForm(savedForm);
    setProblem(null);
    setSaveFailed(false);
  };

  const allowance = costs ? (saved.allowance ?? null) : null;
  const statusItems = useMemo<readonly SettingsStatusEntry[]>(
    () =>
      allowance === null
        ? []
        : [
            {
              id: 'allowance',
              label: 'office.render_models.status_allowance',
              value: t('office.render_models.status_allowance_value', {
                left: formatDollars(allowance.balanceUsd),
                amount: formatDollars(allowance.amountUsd),
              }),
            },
            {
              id: 'refill',
              label: 'office.render_models.status_refill',
              value: t('office.render_models.status_refill_value', {
                amount: formatDollars(allowance.refillAmountUsd),
              }),
            },
          ],
    [t, allowance],
  );
  useSettingsStatus(statusItems);

  const setTier = (tier: RenderTier, patch: Partial<TierForm>) => {
    setForm((f) => ({ ...f, tiers: { ...f.tiers, [tier]: { ...f.tiers[tier], ...patch } } }));
    if (problem !== null) setProblem(null);
  };

  const buttonsOff = !dirty || saving || readOnly;
  const missing = problem === 'tier_model_required';

  return (
    <SettingsMain
      section="render_models"
      title="office.settings.section.render_models"
      subtitle="office.render_models.subtitle"
      flush
    >
      <div data-testid="render-models-form" className={styles.form}>
        <div className={styles.body}>
          {online ? null : (
            <div data-testid="render-models-offline">
              <OfflineBanner message="office.render_models.offline" />
            </div>
          )}
          {saveFailed ? (
            <div data-testid="render-models-save-error">
              <InlineError message="office.render_models.save_failed" onRetry={() => void save()} />
            </div>
          ) : null}
          {problem !== null ? (
            <p data-testid="render-models-problem" role="alert" className={styles.problem}>
              <Icon name="error" size={16} />
              {t(PROBLEM_MESSAGES[problem])}
            </p>
          ) : null}

          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>{t('office.render_models.tiers_title')}</h2>
            <span className={styles.sectionNote}>{t('office.render_models.tiers_note')}</span>
          </div>
          <div className={styles.tableBox}>
            <table className={styles.table} data-testid="render-models-tiers">
              <thead>
                <tr>
                  <th scope="col">{t('office.render_models.col_tier')}</th>
                  <th scope="col">{t('office.render_models.col_model')}</th>
                  <th scope="col">{t('office.render_models.col_output')}</th>
                  {costs ? (
                    <th scope="col" className={styles.num}>
                      {t('office.render_models.col_cost')}
                    </th>
                  ) : null}
                  <th scope="col">{t('office.render_models.col_runs_on')}</th>
                </tr>
              </thead>
              <tbody>
                {RENDER_TIERS.map((tier) => {
                  const f = form.tiers[tier];
                  const model = modelByKey(f.model, saved.models);
                  const empty = f.model === '';
                  const selectId = `render-models-${tier}-model`;
                  return (
                    <tr key={tier} data-tier={tier}>
                      <th scope="row">
                        <span className={styles.tierCell}>
                          <span className={`${styles.tierIcon} ${tier === 'photoreal' ? styles.tierIconDark : ''}`}>
                            <Icon name={TIER_ICONS[tier]} size={16} />
                          </span>
                          <span className={styles.tierText}>
                            <label htmlFor={selectId} className={styles.tierName}>
                              {t(tierLabel(tier))}
                            </label>
                            <span className={styles.tierHint}>{t(tierHint(tier))}</span>
                          </span>
                        </span>
                      </th>
                      <td>
                        <select
                          id={selectId}
                          data-testid={selectId}
                          className={styles.select}
                          disabled={readOnly}
                          aria-invalid={missing && empty ? true : undefined}
                          value={f.model}
                          onChange={(e) => setTier(tier, { model: e.target.value })}
                        >
                          <option value="">{t('office.render_models.choose_model')}</option>
                          {saved.models.map((m) => (
                            <option key={m.key} value={m.key}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={styles.mono} data-testid={`render-models-${tier}-output`}>
                        {model === null ? '—' : outputLabel(model.outputSize)}
                      </td>
                      {costs ? (
                        <td className={styles.num}>
                          <span className={styles.moneyInput}>
                            <span aria-hidden="true">$</span>
                            <input
                              data-testid={`render-models-${tier}-cost`}
                              aria-label={t('office.render_models.cost_label', { tier: t(tierLabel(tier)) })}
                              inputMode="decimal"
                              placeholder="0.00"
                              disabled={readOnly}
                              value={f.cost}
                              onChange={(e) => setTier(tier, { cost: e.target.value })}
                            />
                          </span>
                        </td>
                      ) : null}
                      <td>
                        <span className={styles.chip}>{t('office.render_models.runs_on_cloud')}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className={styles.pending} data-testid="render-models-pending">
            <Icon name="info" size={16} />
            {t('office.render_models.pending_note')}
          </p>

          {costs ? (
            <section className={styles.allowance} data-testid="render-models-allowance">
              <div className={styles.allowanceMain}>
                <div className={styles.sectionHead}>
                  <h2 className={styles.cardTitle}>
                    <Icon name="autorenew" size={18} />
                    {t('office.render_models.allowance_title')}
                  </h2>
                  <span className={styles.sectionNote}>{t('office.render_models.no_hard_limit')}</span>
                </div>
                {allowance === null ? (
                  <p className={styles.sectionNote} data-testid="render-models-allowance-unset">
                    {t('office.render_models.allowance_unset')}
                  </p>
                ) : (
                  <AllowanceUse allowance={allowance} />
                )}
                <div className={styles.amounts}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>{t('office.render_models.amount_label')}</span>
                    <span className={styles.moneyInput}>
                      <span aria-hidden="true">$</span>
                      <input
                        data-testid="render-models-amount"
                        inputMode="decimal"
                        placeholder="0.00"
                        disabled={readOnly}
                        value={form.amount}
                        onChange={(e) => {
                          setForm((f) => ({ ...f, amount: e.target.value }));
                          if (problem !== null) setProblem(null);
                        }}
                      />
                    </span>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>{t('office.render_models.refill_label')}</span>
                    <span className={styles.moneyInput}>
                      <span aria-hidden="true">$</span>
                      <input
                        data-testid="render-models-refill"
                        inputMode="decimal"
                        placeholder="0.00"
                        disabled={readOnly}
                        value={form.refill}
                        onChange={(e) => {
                          setForm((f) => ({ ...f, refill: e.target.value }));
                          if (problem !== null) setProblem(null);
                        }}
                      />
                    </span>
                  </label>
                </div>
              </div>
              <p className={styles.refillNote}>
                <Icon name="notifications" size={16} />
                {t('office.render_models.refill_note')}
              </p>
            </section>
          ) : null}
        </div>
        <div className={styles.footer}>
          {dirty ? (
            <span data-testid="render-models-unsaved" className={styles.unsaved}>
              <span aria-hidden="true" className={styles.dot} />
              {t('office.render_models.unsaved', {
                count: changes.length,
                fields: changes.map((k) => t(CHANGE_LABELS[k])).join(', '),
              })}
            </span>
          ) : null}
          <span className={styles.spacer} />
          <span className={styles.footerNote}>{t('office.render_models.costs_note')}</span>
          <StateButton
            className={styles.plainButton}
            data-testid="render-models-discard"
            disabled={buttonsOff}
            onClick={discard}
          >
            {t('office.render_models.discard')}
          </StateButton>
          <StateButton
            variant="primary"
            className={styles.saveButton}
            data-testid="render-models-save"
            disabled={buttonsOff}
            onClick={() => void save()}
          >
            {t('office.render_models.save')}
          </StateButton>
        </div>
      </div>
    </SettingsMain>
  );
}

function AllowanceUse({ allowance }: { allowance: NonNullable<RenderModelsSettings['allowance']> }) {
  const t = useT();
  const used = Math.max(0, allowance.amountUsd - allowance.balanceUsd);
  const pct = allowance.amountUsd > 0 ? Math.min(100, (used / allowance.amountUsd) * 100) : 0;
  const date = new Date(allowance.lastRefilledAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  return (
    <div className={styles.use} data-testid="render-models-allowance-use">
      <div className={styles.useRow}>
        <span className={styles.sectionNote}>{t('office.render_models.used_since', { date })}</span>
        <span className={styles.useFigure}>
          <strong>{formatDollars(used)}</strong>
          <span className={styles.useOf}> / {formatDollars(allowance.amountUsd)}</span>
        </span>
      </div>
      <div
        className={styles.bar}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={t('office.render_models.used_label')}
      >
        <span className={styles.barFill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.left}>
        {t('office.render_models.left', { amount: formatDollars(Math.max(0, allowance.balanceUsd)) })}
      </span>
    </div>
  );
}

export function RenderModelsLoadError() {
  const router = useRouter();
  return (
    <SettingsMain section="render_models" title="office.settings.section.render_models">
      <div data-testid="render-models-load-error">
        <InlineError message="office.render_models.load_failed" onRetry={() => router.refresh()} />
      </div>
    </SettingsMain>
  );
}
