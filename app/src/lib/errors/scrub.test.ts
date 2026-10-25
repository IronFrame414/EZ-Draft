// EZD-040 U1-U6 (vault/plans/EZD-040.md Tests): scrubEvent covers tags, contexts and stack frames.
// EZD-142 T4-T6 (vault/plans/EZD-142.md Tests; D7-D11): scrubEvent keeps only its allowlist of event fields.
import { describe, expect, it } from 'vitest';
import { scrubEvent, type ScrubbableEvent } from './scrub';

const UUID = '6f1c9a2e-1111-4222-8333-444455556666';
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv12';
const TRACE = '0123456789abcdef0123456789abcdef';
const EMAIL = 'a@b.test';

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

describe('EZD-142 scrubEvent covers every event field', () => {
  it('EZD-142 T4 done when: an email or UUID in each of the five fields comes out with none', () => {
    const input = {
      threads: {
        values: [
          {
            id: 1,
            name: 'worker ' + EMAIL,
            crashed: true,
            current: true,
            main: false,
            foo: EMAIL,
            stacktrace: {
              frames: [
                {
                  function: 'f ' + UUID,
                  filename: 'https://h.test/' + UUID + '.js?x=1',
                  lineno: 3,
                  vars: { e: EMAIL },
                },
              ],
            },
          },
          'not a thread',
        ],
      },
      logentry: { message: 'user ' + EMAIL + ' %s', params: [UUID, 5] },
      exception: {
        values: [
          {
            type: 'E ' + EMAIL,
            value: 'x',
            mechanism: {
              type: 'm ' + UUID,
              handled: false,
              synthetic: true,
              data: { who: EMAIL, [EMAIL]: 'k' },
              source: 'cause ' + EMAIL,
              exception_id: 1,
              parent_id: 0,
              is_exception_group: false,
            },
          },
        ],
      },
      fingerprint: ['{{ default }}', EMAIL, UUID, 7],
    };
    const before = structuredClone(input);
    const out = run(input);
    expect(out).toEqual({
      threads: {
        values: [
          {
            id: 1,
            name: 'worker <email>',
            crashed: true,
            current: true,
            main: false,
            stacktrace: {
              frames: [{ function: 'f <uuid>', filename: 'https://h.test/<uuid>.js', lineno: 3 }],
            },
          },
        ],
      },
      logentry: { message: 'user <email> %s', params: ['<uuid>', 5] },
      exception: {
        values: [
          {
            type: 'E <email>',
            value: 'x',
            mechanism: {
              type: 'm <uuid>',
              handled: false,
              synthetic: true,
              data: { who: '<email>', '<email>': 'k' },
              source: 'cause <email>',
              exception_id: 1,
              parent_id: 0,
              is_exception_group: false,
            },
          },
        ],
      },
      fingerprint: ['{{ default }}', '<email>', '<uuid>'],
    });
    const json = JSON.stringify(out);
    expect(json.includes(EMAIL)).toBe(false);
    expect(json.includes(UUID)).toBe(false);
    expect(input).toEqual(before);
  });

  it('EZD-142 T5 top-level allowlist', () => {
    const full = {
      event_id: '0123456789abcdef0123456789abcdef',
      timestamp: 1,
      start_timestamp: 'x',
      level: 'error',
      platform: 'javascript',
      logger: 'l ' + EMAIL,
      transaction: 'GET /p/' + UUID,
      server_name: 'host',
      release: 'abc123def4567890abc123def4567890abc12345',
      dist: 'd',
      environment: 'preview',
      sdk: {
        name: 'sentry.javascript.browser',
        version: '11.8.0',
        integrations: ['Dedupe'],
        packages: [{ name: 'npm:@sentry/browser', version: '11.8.0' }],
        x: EMAIL,
      },
      modules: { a: '1' },
      debug_meta: { images: [] },
      spans: [],
      measurements: {},
      sdkProcessingMetadata: { ip: '1.2.3.4' },
      transaction_info: { source: 'url' },
      custom: EMAIL,
      extra: { k: 1 },
      breadcrumbs: [],
    };
    expect(run(full)).toEqual({
      event_id: '0123456789abcdef0123456789abcdef',
      timestamp: 1,
      level: 'error',
      platform: 'javascript',
      logger: 'l <email>',
      transaction: 'GET /p/<uuid>',
      release: 'abc123def4567890abc123def4567890abc12345',
      dist: 'd',
      environment: 'preview',
      sdk: {
        name: 'sentry.javascript.browser',
        version: '11.8.0',
        integrations: ['Dedupe'],
        packages: [{ name: 'npm:@sentry/browser', version: '11.8.0' }],
        x: '<email>',
      },
    });
    expect(
      run({ event_id: 'not-hex', level: 'loud', timestamp: '1', message: { a: EMAIL } }),
    ).toEqual({});
  });

  it('EZD-142 T6 malformed parts', () => {
    expect(() => run({ exception: { values: 'x' } })).not.toThrow();
    expect(run({ exception: { values: 'x' } })).toEqual({});
    expect(
      run({
        exception: {
          values: [
            EMAIL,
            {
              type: 5,
              value: 7,
              module: 'm ' + EMAIL,
              thread_id: 'x ' + EMAIL,
              mechanism: 'm',
              foo: EMAIL,
            },
          ],
          other: 1,
        },
      }),
    ).toEqual({ exception: { values: [{ module: 'm <email>', thread_id: 'x <email>' }] } });
    expect(
      run({
        request: { url: { a: EMAIL }, headers: { 'user-agent': { a: 1 }, 'User-Agent': 'UA' } },
      }),
    ).toEqual({ request: { headers: { 'User-Agent': 'UA' } } });
    expect(run({ request: 'x' })).toEqual({});
    expect(run({ user: { id: UUID, email: EMAIL } })).toEqual({ user: { id: '<uuid>' } });
    expect(run({ user: { id: 7 } })).toEqual({ user: { id: 7 } });
    expect(run({ user: { id: { a: 1 } } })).toEqual({});
    expect(run({ fingerprint: 'x', threads: { values: 'x' }, logentry: 'x', sdk: [1] })).toEqual(
      {},
    );
    expect(
      run({ threads: { values: [{ id: 'ab ' + EMAIL, stacktrace: { frames: 'x' } }] } }),
    ).toEqual({ threads: { values: [{ id: 'ab <email>' }] } });
  });
});
