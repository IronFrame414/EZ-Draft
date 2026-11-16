// EZD-237 T11-T13 (vault/plans/EZD-237.md section 4; AC-EZD-237-1, -2; S15i System status, states and iPad
// boards). The unit project has no DOM, so the card renders as static markup and its fetch and message steps are
// tested as functions with stubs. Expected values: S15i wording (Benchmark W23, Run benchmark W24, intro W25,
// budget W26, columns W27-W32, note W33, Missed budget W34, "{n} runs" W35, 50 per page W36; states: Running…
// W14, Pan / Zoom / Wall drag W17-W19, running line W20, empty W39); cells "worst / average" rounded to whole ms
// (S15i "14 / 9"); the budget by 11 Budgets and D-Budget (desktop p95 ≤ 16.7 + 1, no frame over 100 ms; 09m
// rows 1 and 3); a 40-hex version shows 7 characters (D-Version); the pager only above 50 runs (Q-0664; 11 rule
// 9); D-Who (no Run without Edit model), D-Phone (no Run on a phone), D-Offline (Run disabled offline), D-Start
// (200 or 201 is the project, 403 not authorized, else start_failed); only 201 saves; only the card's own frame
// on this origin is heard.
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attr, elements, textOf } from '../../../../test-harness/projects-markup';
import {
  BENCHMARK_MESSAGE_TYPE,
  type BenchmarkRunInput,
  type BenchmarkRunPage,
  type StepResult,
} from '../../../lib/benchmark/benchmark-run';
import { MessagesProvider } from '../../../lib/messages';
import { catalogFor } from '../../../server/messages/catalog';

const env = vi.hoisted(() => ({ online: true, layout: 'full' as string }));
vi.mock('../../../lib/network', async (orig) => ({
  ...(await orig<typeof import('../../../lib/network')>()),
  useOnline: () => env.online,
}));
vi.mock('../../../lib/device/useDeviceLayout', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device/useDeviceLayout')>()),
  useDeviceLayout: () => env.layout,
}));

import {
  BenchmarkCard,
  BenchmarkHistory,
  BenchmarkProgress,
  acceptMessage,
  formatElapsed,
  progressFraction,
  saveBenchmarkRun,
  startBenchmark,
} from './BenchmarkCard';

const html = (node: ReactNode) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {node}
    </MessagesProvider>,
  );
const one = (markup: string, testId: string) => {
  const els = elements(markup, testId);
  expect(els).toHaveLength(1);
  return els[0]!;
};
const decode = (s: string) => s.replaceAll('&#x27;', "'").replaceAll('&amp;', '&');
const text = (markup: string, testId: string) => decode(textOf(one(markup, testId).inner));

const HEX = '0123456789abcdef0123456789abcdef01234567';
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const step = (p: Partial<StepResult> = {}): StepResult => ({
  frames: 180,
  meanMs: 6,
  p95Ms: 12,
  maxMs: 40,
  over100: 0,
  ...p,
});
const row = (id: string, over: Partial<BenchmarkRunInput['results']> = {}) => ({
  id,
  runAt: '2026-11-11T15:20:00.000Z',
  device: {
    userAgent: MAC_CHROME,
    screen: { width: 1600, height: 1000 },
    devicePixelRatio: 2,
    hardwareConcurrency: 8,
    maxTouchPoints: 0,
  },
  appVersion: HEX,
  results: { pan: step(), zoom: step(), drag: step(), memory: null, ...over },
});
const page = (rows: ReturnType<typeof row>[], total = rows.length, p = 1): BenchmarkRunPage => ({
  rows,
  total,
  page: p,
  pageSize: 50,
});

beforeEach(() => {
  env.online = true;
  env.layout = 'full';
});

describe('EZD-237 benchmark card', () => {
  it('EZD-237 T11 history: empty line, then a filled row in the S15i columns', () => {
    const empty = html(<BenchmarkHistory data={page([])} onPage={() => {}} />);
    expect(text(empty, 'benchmark-empty')).toBe('No benchmark runs yet.');
    expect(empty).not.toContain('benchmark-table');

    const filled = html(<BenchmarkHistory data={page([row('r1')])} onPage={() => {}} timeZone="UTC" />);
    const table = one(filled, 'benchmark-table').inner;
    for (const h of ['Date', 'Device', 'Version', 'Pan', 'Zoom', 'Drag', 'Worst / average frame, ms'])
      expect(table).toContain(`>${h}</th>`);
    const r = one(filled, 'benchmark-row');
    expect(attr(r.attrs, 'data-run-id')).toBe('r1');
    expect(attr(r.attrs, 'data-within')).toBe('true');
    expect(text(filled, 'benchmark-when')).toBe('Nov 11, 2026, 3:20 PM');
    expect(text(filled, 'benchmark-device')).toBe('Mac · Chrome');
    expect(attr(one(filled, 'benchmark-device').attrs, 'title')).toBe(MAC_CHROME);
    expect(text(filled, 'benchmark-version')).toBe('0123456');
    expect(text(filled, 'benchmark-pan')).toBe('40 / 6');
    expect(text(filled, 'benchmark-zoom')).toBe('40 / 6');
    expect(text(filled, 'benchmark-drag')).toBe('40 / 6');
    expect(filled).not.toContain('benchmark-missed');
    expect(text(filled, 'benchmark-count')).toBe('1 run');
    expect(filled).toContain('50 per page');
  });

  it('EZD-237 T11 a run over budget is marked and its worst frame is red', () => {
    const over = html(
      <BenchmarkHistory
        data={page([row('r2', { zoom: step({ meanMs: 24.4, p95Ms: 20, maxMs: 118, over100: 1 }) })])}
        onPage={() => {}}
      />,
    );
    expect(attr(one(over, 'benchmark-row').attrs, 'data-within')).toBe('false');
    expect(text(over, 'benchmark-missed')).toBe('Missed budget');
    expect(text(over, 'benchmark-zoom')).toBe('118 / 24');
    expect(one(over, 'benchmark-zoom').inner).toContain('data-over="true"');
    expect(one(over, 'benchmark-pan').inner).toContain('data-over="false"');
  });

  it('EZD-237 T13 pager: shown above 50 runs with the range', () => {
    const rows = Array.from({ length: 50 }, (_, i) => row(`r${i}`));
    const p1 = html(<BenchmarkHistory data={page(rows, 51)} onPage={() => {}} />);
    expect(elements(p1, 'benchmark-row')).toHaveLength(50);
    expect(text(p1, 'benchmark-range')).toBe('1–50 of 51');
    expect(text(p1, 'benchmark-count')).toBe('51 runs');
    expect(one(p1, 'benchmark-prev').attrs).toContain('disabled');
    expect(one(p1, 'benchmark-next').attrs).not.toContain('disabled');
    const p2 = html(<BenchmarkHistory data={page([row('last')], 51, 2)} onPage={() => {}} />);
    expect(text(p2, 'benchmark-range')).toBe('51–51 of 51');
    expect(one(p2, 'benchmark-next').attrs).toContain('disabled');
    const fifty = html(<BenchmarkHistory data={page(rows, 50)} onPage={() => {}} />);
    expect(fifty).not.toContain('benchmark-range');
  });

  it('EZD-237 T12 Run button: Edit model, phone, offline', () => {
    const card = html(<BenchmarkCard canRun />);
    expect(text(card, 'benchmark-run')).toBe('Run benchmark');
    expect(one(card, 'benchmark-run').attrs).not.toContain('disabled');
    expect(card).toContain('>Benchmark</h2>');
    expect(card).toContain(
      'Plays a set pan, zoom and wall drag on the benchmark project and times every frame.',
    );
    expect(card).toContain(
      'Budget: a frame every 16 ms on desktop and 33 ms on iPad, and no frame over 100 ms.',
    );
    expect(html(<BenchmarkCard canRun={false} />)).not.toContain('benchmark-run');
    env.layout = 'phone';
    expect(html(<BenchmarkCard canRun />)).not.toContain('benchmark-run');
    env.layout = 'full';
    env.online = false;
    expect(one(html(<BenchmarkCard canRun />), 'benchmark-run').attrs).toContain('disabled');
  });

  it('EZD-237 T12 running: Running…, the three steps, the bar, the time and the frame', () => {
    const card = html(
      <BenchmarkCard
        canRun
        initialRun={{
          kind: 'running',
          projectId: 'p1',
          step: 'zoom',
          frame: 90,
          startedAt: 0,
          size: { width: 1600, height: 1000 },
        }}
      />,
    );
    expect(text(card, 'benchmark-run')).toBe('Running…');
    expect(one(card, 'benchmark-run').attrs).toContain('disabled');
    expect(attr(one(card, 'benchmark-step-pan').attrs, 'data-state')).toBe('done');
    expect(attr(one(card, 'benchmark-step-zoom').attrs, 'data-state')).toBe('current');
    expect(attr(one(card, 'benchmark-step-drag').attrs, 'data-state')).toBe('pending');
    expect(text(card, 'benchmark-step-drag')).toBe('Wall drag');
    expect(text(card, 'benchmark-progress')).toContain(
      "Playing on the benchmark project. Don't touch the mouse or keyboard until it finishes.",
    );
    expect(attr(one(card, 'benchmark-bar').attrs, 'style')).toBe('width:50%');
    const frame = one(card, 'benchmark-frame');
    expect(attr(frame.attrs, 'src')).toBe('/projects/p1?benchmark=run');
    expect(attr(frame.attrs, 'width')).toBe('1600');
    expect(attr(frame.attrs, 'height')).toBe('1000');

    const p = html(<BenchmarkProgress step="drag" frame={180} elapsedMs={14_500} />);
    expect(text(p, 'benchmark-elapsed')).toBe('0:14');
    expect(attr(one(p, 'benchmark-bar').attrs, 'style')).toBe('width:100%');
  });

  it('EZD-237 T12 errors: the message, and Retry only for a failed save', () => {
    const body = { ...row('x'), id: undefined, runAt: undefined } as unknown as BenchmarkRunInput;
    const cases: [string, string, boolean][] = [
      ['not_authorized', "You don't have permission to do that.", false],
      ['start_failed', "Couldn't open the benchmark project. Try again.", false],
      ['plan_not_ready', "The plan didn't finish loading, so the benchmark didn't run.", false],
      ['not_benchmark', "This isn't the benchmark project.", false],
      ['save_failed', "Couldn't save the benchmark run. Check your connection and try again.", true],
    ];
    for (const [code, message, retry] of cases) {
      const card = html(
        <BenchmarkCard canRun initialRun={{ kind: 'error', code: code as never, body }} />,
      );
      const e = one(card, 'benchmark-error');
      expect(attr(e.attrs, 'data-benchmark-error')).toBe(code);
      expect(decode(textOf(e.inner))).toContain(message);
      expect(e.inner.includes('Retry')).toBe(retry);
      expect(one(card, 'benchmark-run').attrs).not.toContain('disabled');
    }
  });

  it('EZD-237 T12 start: 201 and 200 open the project, 403 refused, others start_failed', async () => {
    const reply = (status: number, body: unknown = { project: { id: 'p1' } }) =>
      vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    const f201 = reply(201);
    expect(await startBenchmark(f201)).toEqual({ ok: true, projectId: 'p1' });
    expect(vi.mocked(f201).mock.calls[0]![0]).toBe('/api/benchmark/project');
    expect(vi.mocked(f201).mock.calls[0]![1]).toMatchObject({ method: 'POST' });
    expect(await startBenchmark(reply(200))).toEqual({ ok: true, projectId: 'p1' });
    expect(await startBenchmark(reply(403))).toEqual({ ok: false, code: 'not_authorized' });
    expect(await startBenchmark(reply(500))).toEqual({ ok: false, code: 'start_failed' });
    const thrown = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await startBenchmark(thrown)).toEqual({ ok: false, code: 'start_failed' });
  });

  it('EZD-237 save: only 201 is saved; the body is the run', async () => {
    const body = {
      device: row('x').device,
      appVersion: 'dev-1',
      results: row('x').results,
    };
    const ok = vi.fn(async () => new Response('{}', { status: 201 })) as unknown as typeof fetch;
    expect(await saveBenchmarkRun(ok, body)).toBe(true);
    const [url, init] = vi.mocked(ok).mock.calls[0]!;
    expect(url).toBe('/api/benchmark/runs');
    expect(init).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(init!.body))).toEqual(body);
    const bad = vi.fn(async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
    expect(await saveBenchmarkRun(bad, body)).toBe(false);
  });

  it('EZD-237 only the card frame on this origin is heard', () => {
    const frame = {};
    const data = { type: BENCHMARK_MESSAGE_TYPE, kind: 'progress', step: 'pan', frame: 30 };
    const origin = 'https://ezdraft.example';
    expect(acceptMessage({ origin, source: frame as never, data }, frame, origin)).toEqual(data);
    expect(acceptMessage({ origin, source: {} as never, data }, frame, origin)).toBeNull();
    expect(acceptMessage({ origin: 'https://evil.example', source: frame as never, data }, frame, origin)).toBeNull();
    expect(acceptMessage({ origin, source: frame as never, data: { x: 1 } }, frame, origin)).toBeNull();
    expect(acceptMessage({ origin, source: null, data }, null, origin)).toBeNull();
  });

  it('EZD-237 progress and elapsed time', () => {
    expect(progressFraction('pan', 0)).toBe(0);
    expect(progressFraction('zoom', 90)).toBe(0.5);
    expect(progressFraction('drag', 180)).toBe(1);
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(14_999)).toBe('0:14');
    expect(formatElapsed(75_000)).toBe('1:15');
  });
});
