'use client';

// EZD-237 (vault/plans/EZD-237.md section 3 C7, C8, Decided D-Who, D-Phone, D-Offline, D-Start, D-Card, D-Cells;
// S15i System status, states and iPad boards, approved 2026-11-11: the benchmark plays with its progress shown in
// the Benchmark card and the page stays open; Q-0664; 11 rule 9; AC-EZD-237-1, -2): the Benchmark card on
// System status. Run benchmark opens the benchmark project in a same-origin frame inside the card (the editor at
// the window's size, shown scaled down), shows Pan, Zoom and Wall drag progress from the frame's messages, saves
// the run, and reloads the history: newest first, 50 per page, worst / average frame per step, a mark on runs
// that missed budget.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { appVersion } from '../../../lib/app-version';
import {
  BENCHMARK_PAGE_SIZE,
  BENCHMARK_STEPS,
  BENCHMARK_STEP_FRAMES,
  benchmarkEditorPath,
  budgetProfile,
  deviceBrowser,
  deviceSystem,
  parseBenchmarkMessage,
  readDevice,
  shortVersion,
  withinBudget,
  type BenchmarkMessage,
  type BenchmarkResults,
  type BenchmarkRunInput,
  type BenchmarkRunPage,
  type BenchmarkRunRow,
  type BenchmarkRunnerError,
  type BenchmarkStep,
} from '../../../lib/benchmark/benchmark-run';
import { useDeviceLayout } from '../../../lib/device/useDeviceLayout';
import type { MessageKey } from '../../../server/messages/catalog';
import { useT } from '../../../lib/messages';
import { useOnline } from '../../../lib/network';
import { formatStatusTime } from '../../../lib/system-status/system-status';
import { Icon } from '../../icon/Icon';
import { AsyncView } from '../../states/AsyncView';
import { InlineError } from '../../states/InlineError';
import { Skeleton, SkeletonGroup } from '../../states/Skeleton';
import { StateButton } from '../../states/StateButton';
import styles from './Benchmark.module.css';
import status from './SystemStatus.module.css';

export type BenchmarkCardError = BenchmarkRunnerError | 'start_failed' | 'save_failed';

export const BENCHMARK_ERROR_KEYS: Record<BenchmarkCardError, MessageKey> = {
  not_authorized: 'error.not_authorized',
  not_benchmark: 'office.benchmark.not_benchmark',
  plan_not_ready: 'office.benchmark.plan_not_ready',
  failed: 'office.benchmark.failed',
  start_failed: 'office.benchmark.start_failed',
  save_failed: 'office.benchmark.save_failed',
};

// No message from the frame for this long ends the run (the editor never loaded, or the frame stopped).
export const FRAME_SILENCE_MS = 60000;
// The frame is shown scaled to the card's width, at most this tall.
const STAGE_MAX_HEIGHT = 320;

export type RunState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | {
      kind: 'running';
      projectId: string;
      step: BenchmarkStep;
      frame: number;
      startedAt: number;
      size: { width: number; height: number };
    }
  | { kind: 'saving'; body: BenchmarkRunInput }
  | { kind: 'error'; code: BenchmarkCardError; body?: BenchmarkRunInput };

type Fetch = typeof fetch;

// D-Start: 200 or 201 is the project; 403 is not authorized; anything else, or a throw, is start_failed.
export async function startBenchmark(
  fetchFn: Fetch,
): Promise<{ ok: true; projectId: string } | { ok: false; code: 'not_authorized' | 'start_failed' }> {
  try {
    const res = await fetchFn('/api/benchmark/project', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (res.status === 403) return { ok: false, code: 'not_authorized' };
    if (res.status !== 200 && res.status !== 201) return { ok: false, code: 'start_failed' };
    const body = (await res.json()) as { project?: { id?: unknown } };
    const id = body.project?.id;
    return typeof id === 'string' ? { ok: true, projectId: id } : { ok: false, code: 'start_failed' };
  } catch {
    return { ok: false, code: 'start_failed' };
  }
}

// The card saves the run; only 201 is saved.
export async function saveBenchmarkRun(fetchFn: Fetch, body: BenchmarkRunInput): Promise<boolean> {
  try {
    const res = await fetchFn('/api/benchmark/runs', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.status === 201;
  } catch {
    return false;
  }
}

export function runBody(results: BenchmarkResults): BenchmarkRunInput {
  return {
    device: readDevice(navigator, window.screen, window.devicePixelRatio),
    appVersion: appVersion(),
    results,
  };
}

// Only a message from the card's own frame, on this origin, of a known shape.
export function acceptMessage(
  event: Pick<MessageEvent, 'origin' | 'source' | 'data'>,
  frame: unknown,
  origin: string,
): BenchmarkMessage | null {
  if (frame === null || frame === undefined || event.source !== frame || event.origin !== origin)
    return null;
  return parseBenchmarkMessage(event.data);
}

export function progressFraction(step: BenchmarkStep, frame: number): number {
  return (BENCHMARK_STEPS.indexOf(step) * BENCHMARK_STEP_FRAMES + frame) /
    (BENCHMARK_STEPS.length * BENCHMARK_STEP_FRAMES);
}

// S15i states "0:14": minutes and seconds since the run started.
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const STEP_KEYS: Record<BenchmarkStep, MessageKey> = {
  pan: 'office.benchmark.step_pan',
  zoom: 'office.benchmark.step_zoom',
  drag: 'office.benchmark.step_drag',
};

export function BenchmarkProgress({
  step,
  frame,
  elapsedMs,
  children,
}: {
  step: BenchmarkStep;
  frame: number;
  elapsedMs: number;
  children?: ReactNode;
}) {
  const t = useT();
  const at = BENCHMARK_STEPS.indexOf(step);
  return (
    <div data-testid="benchmark-progress" className={styles.progress}>
      <div className={styles.steps}>
        {BENCHMARK_STEPS.map((s, i) => {
          const state = i < at ? 'done' : i === at ? 'current' : 'pending';
          return (
            <span
              key={s}
              data-testid={`benchmark-step-${s}`}
              data-state={state}
              className={styles.step}
            >
              {state === 'done' ? (
                <Icon name="check_circle" size={16} />
              ) : state === 'current' ? (
                <Icon name="radio_button_checked" size={16} />
              ) : (
                <span className={styles.dot} />
              )}
              {t(STEP_KEYS[s])}
            </span>
          );
        })}
        <span data-testid="benchmark-elapsed" className={styles.elapsed}>
          {formatElapsed(elapsedMs)}
        </span>
      </div>
      <div className={styles.bar}>
        <div
          data-testid="benchmark-bar"
          className={styles.barFill}
          style={{ width: `${Math.round(progressFraction(step, frame) * 1000) / 10}%` }}
        />
      </div>
      <span className={styles.message}>{t('office.benchmark.running')}</span>
      {children}
    </div>
  );
}

function StepCell({
  testId,
  row,
  step,
}: {
  testId: string;
  row: BenchmarkRunRow;
  step: BenchmarkStep;
}) {
  const r = row.results[step];
  const over = !withinBudget(r, budgetProfile(row.device));
  return (
    <td data-testid={testId} className={status.td}>
      <span className={styles.num}>
        <span className={over ? styles.over : undefined} data-over={over ? 'true' : 'false'}>
          {String(Math.round(r.maxMs))}
        </span>
        {` / ${String(Math.round(r.meanMs))}`}
      </span>
    </td>
  );
}

export function BenchmarkHistory({
  data,
  onPage,
  timeZone,
}: {
  data: BenchmarkRunPage;
  onPage: (page: number) => void;
  timeZone?: string;
}) {
  const t = useT();
  if (data.total === 0) {
    return (
      <div data-testid="benchmark-empty" className={styles.empty}>
        {t('office.benchmark.empty')}
      </div>
    );
  }
  const other = t('office.benchmark.other');
  const from = (data.page - 1) * BENCHMARK_PAGE_SIZE + 1;
  const to = Math.min(data.page * BENCHMARK_PAGE_SIZE, data.total);
  return (
    <>
      <table data-testid="benchmark-table" className={status.table}>
        <thead>
          <tr>
            <th className={status.th}>{t('office.benchmark.col_date')}</th>
            <th className={status.th}>{t('office.benchmark.col_device')}</th>
            <th className={`${status.th} ${styles.version}`}>
              {t('office.benchmark.col_version')}
            </th>
            <th className={status.th}>{t('office.benchmark.col_pan')}</th>
            <th className={status.th}>{t('office.benchmark.col_zoom')}</th>
            <th className={status.th}>{t('office.benchmark.col_drag')}</th>
            <th className={status.th} />
          </tr>
          <tr>
            <th className={styles.note} colSpan={3} />
            <th className={styles.note} colSpan={4}>
              {t('office.benchmark.col_note')}
            </th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => {
            const missed = !BENCHMARK_STEPS.every((s) =>
              withinBudget(row.results[s], budgetProfile(row.device)),
            );
            return (
              <tr
                key={row.id}
                data-testid="benchmark-row"
                data-run-id={row.id}
                data-within={missed ? 'false' : 'true'}
                className={status.tr}
              >
                <td data-testid="benchmark-when" className={status.td}>
                  <span className={status.mono}>{formatStatusTime(row.runAt, timeZone)}</span>
                </td>
                <td
                  data-testid="benchmark-device"
                  className={status.td}
                  title={row.device.userAgent}
                >
                  {t('office.benchmark.device', {
                    system: deviceSystem(row.device) ?? other,
                    browser: deviceBrowser(row.device.userAgent) ?? other,
                  })}
                </td>
                <td data-testid="benchmark-version" className={`${status.td} ${styles.version}`}>
                  <span className={status.mono}>{shortVersion(row.appVersion)}</span>
                </td>
                <StepCell testId="benchmark-pan" row={row} step="pan" />
                <StepCell testId="benchmark-zoom" row={row} step="zoom" />
                <StepCell testId="benchmark-drag" row={row} step="drag" />
                <td className={status.td}>
                  {missed ? (
                    <span data-testid="benchmark-missed" className={styles.missed}>
                      <Icon name="error" size={14} />
                      {t('office.benchmark.missed')}
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className={styles.foot}>
        <span data-testid="benchmark-count">
          {t('office.benchmark.count', { count: data.total })}
        </span>
        <span className={styles.footFill} />
        {data.total > BENCHMARK_PAGE_SIZE ? (
          <>
            <span data-testid="benchmark-range">
              {t('office.system_status.range', { from, to, total: data.total })}
            </span>
            <StateButton
              data-testid="benchmark-prev"
              compact
              aria-label={t('office.system_status.prev')}
              title={t('office.system_status.prev')}
              disabled={data.page <= 1}
              onClick={() => onPage(data.page - 1)}
            >
              <Icon name="chevron_left" size={18} />
            </StateButton>
            <StateButton
              data-testid="benchmark-next"
              compact
              aria-label={t('office.system_status.next')}
              title={t('office.system_status.next')}
              disabled={to >= data.total}
              onClick={() => onPage(data.page + 1)}
            >
              <Icon name="chevron_right" size={18} />
            </StateButton>
          </>
        ) : null}
        <span>{t('office.benchmark.per_page')}</span>
      </div>
    </>
  );
}

const skeleton = (
  <SkeletonGroup count={3} className={status.skeleton}>
    <Skeleton height="36px" />
  </SkeletonGroup>
);

function Stage({
  projectId,
  size,
  onFrame,
}: {
  projectId: string;
  size: { width: number; height: number };
  onFrame: (frame: Window | null) => void;
}) {
  const [scale, setScale] = useState(0);
  const measure = useCallback(
    (el: HTMLDivElement | null) => {
      if (el === null) return;
      setScale(Math.min(el.clientWidth / size.width, STAGE_MAX_HEIGHT / size.height));
    },
    [size],
  );
  return (
    <div ref={measure} className={styles.stage} style={{ height: size.height * scale }}>
      <iframe
        ref={(el) => onFrame(el?.contentWindow ?? null)}
        data-testid="benchmark-frame"
        className={styles.frame}
        src={benchmarkEditorPath(projectId)}
        width={size.width}
        height={size.height}
        tabIndex={-1}
        aria-hidden="true"
        style={{ transform: `scale(${scale})` }}
      />
    </div>
  );
}

export function BenchmarkCard({
  canRun,
  timeZone,
  tick = 0,
  initialRun = { kind: 'idle' },
}: {
  canRun: boolean;
  timeZone?: string;
  // The page's Refresh reloads the history too.
  tick?: number;
  initialRun?: RunState;
}) {
  const t = useT();
  const online = useOnline();
  const layout = useDeviceLayout();
  const [page, setPage] = useState(1);
  const [saved, setSaved] = useState(0);
  const [run, setRun] = useState<RunState>(initialRun);
  const [now, setNow] = useState(0);
  const [heard, setHeard] = useState(0);
  const frameWindow = useRef<Window | null>(null);

  const load = useCallback(
    async (signal: AbortSignal) => {
      const res = await fetch(`/api/benchmark/runs?page=${page}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      });
      if (res.status !== 200) throw new Error('benchmark_runs_load_failed');
      const data = (await res.json()) as BenchmarkRunPage;
      if (data.rows.length === 0 && data.total > 0 && page > 1) {
        setPage(Math.ceil(data.total / BENCHMARK_PAGE_SIZE));
      }
      return data;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick and saved reload the history
    [page, tick, saved],
  );

  const save = useCallback(async (body: BenchmarkRunInput) => {
    setRun({ kind: 'saving', body });
    if (await saveBenchmarkRun(fetch, body)) {
      setRun({ kind: 'idle' });
      setPage(1);
      setSaved((n) => n + 1);
    } else {
      setRun({ kind: 'error', code: 'save_failed', body });
    }
  }, []);

  const running = run.kind === 'running';
  // Messages from the card's own frame: progress, the result (then saved here) or an error code.
  useEffect(() => {
    if (!running) return;
    const onMessage = (event: MessageEvent) => {
      const m = acceptMessage(event, frameWindow.current, window.location.origin);
      if (m === null) return;
      setHeard(Date.now());
      if (m.kind === 'progress') {
        setRun((s) => (s.kind === 'running' ? { ...s, step: m.step, frame: m.frame } : s));
      } else if (m.kind === 'result') {
        void save(runBody(m.results));
      } else {
        setRun({ kind: 'error', code: m.code });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [running, save]);

  // A frame that goes quiet ends the run.
  useEffect(() => {
    if (!running) return;
    const id = setTimeout(() => setRun({ kind: 'error', code: 'plan_not_ready' }), FRAME_SILENCE_MS);
    return () => clearTimeout(id);
  }, [running, heard]);

  // The elapsed time on the running panel (display only).
  useEffect(() => {
    if (!running) return;
    // eslint-disable-next-line no-restricted-globals -- display-only clock for the running panel, no data polled
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const onRun = async () => {
    setRun({ kind: 'starting' });
    const started = await startBenchmark(fetch);
    if (!started.ok) return setRun({ kind: 'error', code: started.code });
    const at = Date.now();
    setNow(at);
    setHeard(at);
    setRun({
      kind: 'running',
      projectId: started.projectId,
      step: 'pan',
      frame: 0,
      startedAt: at,
      size: { width: window.innerWidth, height: window.innerHeight },
    });
  };

  // D-Who, D-Phone: no Run button without Edit model or on a phone (the editor cannot open there).
  const showRun = canRun && layout !== 'phone';
  const busy = run.kind === 'starting' || run.kind === 'running' || run.kind === 'saving';
  const onFrame = useCallback((frame: Window | null) => {
    frameWindow.current = frame;
  }, []);

  return (
    <section data-testid="benchmark-card" className={status.card}>
      <div className={status.head}>
        <h2 className={status.title}>{t('office.benchmark.title')}</h2>
        {showRun ? (
          <StateButton
            data-testid="benchmark-run"
            className={styles.headRun}
            compact
            disabled={busy || !online}
            onClick={() => void onRun()}
          >
            {busy ? t('office.benchmark.running_button') : t('office.benchmark.run')}
          </StateButton>
        ) : null}
      </div>
      <div className={styles.lines}>
        <span className={styles.hint}>{t('office.benchmark.intro')}</span>
        <span className={styles.hint}>{t('office.benchmark.budget')}</span>
      </div>
      {run.kind === 'running' ? (
        <BenchmarkProgress step={run.step} frame={run.frame} elapsedMs={now - run.startedAt}>
          <Stage projectId={run.projectId} size={run.size} onFrame={onFrame} />
        </BenchmarkProgress>
      ) : null}
      {run.kind === 'error' ? (
        <div
          data-testid="benchmark-error"
          data-benchmark-error={run.code}
          className={styles.alert}
        >
          <InlineError
            message={BENCHMARK_ERROR_KEYS[run.code]}
            onRetry={
              run.code === 'save_failed' && run.body !== undefined
                ? () => void save(run.body!)
                : undefined
            }
          />
        </div>
      ) : null}
      <div data-testid="benchmark-body" className={status.body}>
        <AsyncView load={load} skeleton={skeleton} errorMessage="office.benchmark.load_failed">
          {(d) => <BenchmarkHistory data={d} onPage={setPage} timeZone={timeZone} />}
        </AsyncView>
      </div>
    </section>
  );
}
