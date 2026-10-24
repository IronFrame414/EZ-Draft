// EZD-040 U1-U6 (vault/plans/EZD-040.md Tests): scrubEvent covers tags, contexts and stack frames.
import { describe, expect, it } from 'vitest';
import { scrubEvent, type ScrubbableEvent } from './scrub';

const UUID = '6f1c9a2e-1111-4222-8333-444455556666';
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv12';
const TRACE = '0123456789abcdef0123456789abcdef';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (event: object): any => scrubEvent(event as ScrubbableEvent);

const tags1 = () => ({
  'ezd.source': 'browser',
  'ezd.location': 'pwa.register',
  mail: 'a@b.test',
  project: UUID,
  share: TOKEN,
  'a@b.test': 'k',
  n: 3,
  ok: true,
  obj: { x: 1 },
  arr: ['a'],
  nul: null,
});

const contexts1 = () => ({
  page: {
    url: 'https://h.test/p/x?t=1',
    owner: 'a@b.test',
    ids: [UUID, 7, null, true],
    nested: { code: 'code 482913', deeper: { k: TOKEN } },
  },
  'a@b.test': { k: 'v' },
  trace: { trace_id: TRACE, sampled: false },
});

const exception1 = () => ({
  values: [
    {
      type: 'Error',
      value: 'v a@b.test',
      stacktrace: {
        frames_omitted: [1, 2],
        frames: [
          {
            filename: 'https://h.test/_next/static/chunks/a.js?dpl=dpl_x',
            abs_path: `https://h.test/p/${UUID}/x.js`,
            function: 'send a@b.test',
            module: 'm 482913',
            context_line: `token ${TOKEN}`,
            pre_context: ['a@b.test', 5],
            post_context: ['ok'],
            lineno: 1,
            colno: 2,
            in_app: true,
            vars: { password: 'p' },
            foo: 'a@b.test',
          },
          'not a frame',
        ],
      },
    },
  ],
});

describe('EZD-040 scrubEvent tags, contexts and frames', () => {
  it('EZD-040 U1 tags scrubbed', () => {
    expect(run({ tags: tags1() }).tags).toEqual({
      'ezd.source': 'browser',
      'ezd.location': 'pwa.register',
      mail: '<email>',
      project: '<uuid>',
      share: '<token>',
      '<email>': 'k',
      n: 3,
      ok: true,
    });
    expect(run({ tags: { 'ezd.job_id': UUID } }).tags).toEqual({ 'ezd.job_id': UUID });
    expect(run({ tags: { 'ezd.job_id': 'job a@b.test' } }).tags).toEqual({
      'ezd.job_id': 'job <email>',
    });
    expect('tags' in run({ tags: ['a'] })).toBe(false);
  });

  it('EZD-040 U2 contexts scrubbed at every depth', () => {
    expect(run({ contexts: contexts1() }).contexts).toEqual({
      page: {
        url: 'https://h.test/p/x',
        owner: '<email>',
        ids: ['<uuid>', 7, null, true],
        nested: { code: 'code <code>', deeper: { k: '<token>' } },
      },
      '<email>': { k: 'v' },
      trace: { trace_id: '<token>', sampled: false },
    });
    expect('contexts' in run({ contexts: 'x' })).toBe(false);
  });

  it('EZD-040 U3 stack frames', () => {
    const out = run({ exception: exception1() });
    expect(out.exception.values[0]).toEqual({
      type: 'Error',
      value: 'v <email>',
      stacktrace: {
        frames: [
          {
            filename: 'https://h.test/_next/static/chunks/a.js',
            abs_path: 'https://h.test/p/<uuid>/x.js',
            function: 'send <email>',
            module: 'm <code>',
            context_line: 'token <token>',
            pre_context: ['<email>'],
            post_context: ['ok'],
            lineno: 1,
            colno: 2,
            in_app: true,
          },
        ],
      },
    });
    const second = run({ exception: { values: [{ stacktrace: { frames: 'x' } }] } });
    expect('stacktrace' in second.exception.values[0]).toBe(false);
  });

  it('EZD-040 U4 input unchanged', () => {
    const event = { tags: tags1(), contexts: contexts1(), exception: exception1() };
    const before = structuredClone(event);
    scrubEvent(event as ScrubbableEvent);
    expect(event).toEqual(before);
  });

  it('EZD-040 U5 deep and cyclic contexts', () => {
    let leaf: unknown = 'x@y.test';
    for (let i = 0; i < 100000; i++) leaf = { a: leaf };
    const out = run({ contexts: { c: leaf } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let node: any = out.contexts.c;
    for (let i = 0; i < 100000; i++) node = node.a;
    expect(node).toBe('<email>');

    const a: Record<string, unknown> = { k: 'a@b.test' };
    a.self = a;
    expect(run({ contexts: { a } }).contexts).toEqual({ a: { k: '<email>', self: null } });
  });

  it('EZD-040 U6 nothing added', () => {
    expect(run({ message: 'm' })).toEqual({ message: 'm' });
    expect(run({ exception: { values: [{ type: 'Error', value: 'x' }] } })).toEqual({
      exception: { values: [{ type: 'Error', value: 'x' }] },
    });
  });
});
