// EZD-105b unit tests (AC-EZD-105b-2, -3, -4). Expected values: Q-0096 P3 (16 characters, made by EZ Draft),
// P5 (the member is emailed that it was set), P7; vault/plans/EZD-105b.md Decided "Password maker" (56-character
// alphabet, 10 tries), "`setOwnerPassword` steps" (order and mapping) and "Secrets"; password-rules.ts
// (contains_app_name, contains_email_name); section 6 wording.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const spies = vi.hoisted(() => ({ report: vi.fn(), routeFailure: vi.fn(), emit: vi.fn() }));
vi.mock('../errors/report', () => ({ reportError: spies.report }));
vi.mock('../errors/route-failure', () => ({ reportRouteFailure: spies.routeFailure }));
vi.mock('../events', () => ({ emit: spies.emit }));

import { appOrigin } from '../errors/app-origin';
import type { SendEmailInput, SendEmailResult } from '../email/types';
import {
  GENERATE_TRIES,
  GENERATED_PASSWORD_ALPHABET,
  GENERATED_PASSWORD_LENGTH,
  generateMemberPassword,
  setOwnerPassword,
  type OwnerPasswordDeps,
} from './owner-password';

const PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789]{16}$/;
const PW = 'P'.repeat(16);
const ID = '11111111-1111-4111-8111-111111111111';

// A randomIndex fake that spells `first`, then answers `then` forever; it counts its calls.
function spelling(first: string, then: number) {
  let calls = 0;
  const fn = () => {
    const i = calls++;
    return i < first.length ? GENERATED_PASSWORD_ALPHABET.indexOf(first[i]) : then;
  };
  return { fn, calls: () => calls };
}

type Answer = { data?: unknown; error?: { code: string; message?: string } | null };

function fakeClient(answers: Record<string, Answer>, log: string[]) {
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    log.push(`${fn}:${JSON.stringify(args)}`);
    const a = answers[fn] ?? {};
    return { data: a.data ?? null, error: a.error ?? null };
  });
  return { rpc } as never;
}

const TARGET: Answer = { data: { authUserId: 'a1', email: 'ann@example.test' } };
const RECORD: Answer = {
  data: {
    tenantId: 't1',
    appUserId: 'u1',
    memberEmail: 'ann@example.test',
    memberName: 'Ann Lee',
    actorLabel: 'Zed Owner',
    actorEmail: 'zed@example.test',
    companyName: 'Worth Properties',
    companyReplyTo: 'office@example.test',
  },
};

function deps(log: string[], over: Partial<OwnerPasswordDeps> = {}): OwnerPasswordDeps {
  return {
    newPassword: (email) => {
      log.push(`newPassword:${email}`);
      return PW;
    },
    setMemberPassword: async (id, pw) => {
      log.push(`setMemberPassword:${id}:${pw}`);
    },
    sendEmail: (async (input: SendEmailInput) => {
      log.push(`sendEmail:${JSON.stringify(input)}`);
      return { status: 'sent', link: input.link.url } as SendEmailResult;
    }) as OwnerPasswordDeps['sendEmail'],
    ...over,
  };
}

const reported = () => spies.report.mock.calls.map((c) => (c[0] as Error).message);

beforeEach(() => {
  spies.report.mockReset();
  spies.routeFailure.mockReset();
  spies.emit.mockReset();
});

describe('EZD-105b generateMemberPassword', () => {
  it('G1 16 characters from the 56-character alphabet, all different', () => {
    expect(GENERATED_PASSWORD_LENGTH).toBe(16);
    expect(GENERATED_PASSWORD_ALPHABET).toHaveLength(56);
    for (const c of ['I', 'O', 'l', 'o', '0', '1']) expect(GENERATED_PASSWORD_ALPHABET).not.toContain(c);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generateMemberPassword('ann@example.test');
      expect(p).toMatch(PATTERN);
      seen.add(p);
    }
    expect(seen.size).toBe(200);
  });

  it('G2 a candidate validateNewPassword refuses is made again; 10 refusals throw', () => {
    const a = spelling('ezdraftABCDEFGHJ', 0);
    expect(generateMemberPassword('ann@example.test', a.fn)).toBe('A'.repeat(16));
    expect(a.calls()).toBe(32);

    const b = spelling('kmnpABCDEFGHJKLM', 1);
    expect(generateMemberPassword('kmnp@example.test', b.fn)).toBe('B'.repeat(16));
    expect(b.calls()).toBe(32);

    const word = 'ezdraft';
    let n = 0;
    const always = () => GENERATED_PASSWORD_ALPHABET.indexOf(word[n++ % 16 % word.length]);
    expect(() => generateMemberPassword('ann@example.test', always)).toThrow(
      'owner_password_generate_failed',
    );
    expect(GENERATE_TRIES).toBe(10);
    expect(n).toBe(160);
  });
});

describe('EZD-105b setOwnerPassword', () => {
  it('S1 check, make, set, record, email; the password only in the result', async () => {
    const log: string[] = [];
    const client = fakeClient(
      { owner_password_target: TARGET, record_member_password_set: RECORD },
      log,
    );
    const r = await setOwnerPassword(client, ID, '203.0.113.7', deps(log));
    expect(r).toEqual({ status: 200, body: { password: PW, emailSent: true } });
    expect(log.map((l) => l.split(':')[0])).toEqual([
      'owner_password_target',
      'newPassword',
      'setMemberPassword',
      'record_member_password_set',
      'sendEmail',
    ]);
    expect(log[0]).toBe(`owner_password_target:${JSON.stringify({ p_membership_id: ID })}`);
    expect(log[2]).toBe(`setMemberPassword:a1:${PW}`);
    expect(log[3]).toBe(
      `record_member_password_set:${JSON.stringify({ p_membership_id: ID, p_ip: '203.0.113.7' })}`,
    );
    const email = JSON.parse(log[4].slice('sendEmail:'.length)) as SendEmailInput;
    expect(email).toEqual({
      to: 'ann@example.test',
      sentBy: { email: 'zed@example.test' },
      subject: 'A new password was set for your EZ Draft account',
      paragraphs: [
        "Zed Owner set a new password for your EZ Draft account (ann@example.test) and signed you out on every device. Ask Zed Owner for the new password. If you weren't expecting this, contact your company right away.",
      ],
      link: { url: appOrigin(process.env), label: 'Open EZ Draft' },
      company: { name: 'Worth Properties', replyTo: 'office@example.test' },
      lang: 'en',
    });
    expect(log[4]).not.toContain(PW);
    expect(spies.emit).not.toHaveBeenCalled();
    expect(spies.report).not.toHaveBeenCalled();
  });

  it('S2 a failure after the check: nothing recorded or emailed after Auth fails; no password returned', async () => {
    // (a) Auth refuses.
    let log: string[] = [];
    let r = await setOwnerPassword(
      fakeClient({ owner_password_target: TARGET, record_member_password_set: RECORD }, log),
      ID,
      null,
      deps(log, {
        setMemberPassword: async () => {
          throw new Error('admin_password_failed');
        },
      }),
    );
    expect(r).toEqual({ status: 500, code: 'db_unavailable' });
    expect(log.some((l) => l.startsWith('record_member_password_set'))).toBe(false);
    expect(log.some((l) => l.startsWith('sendEmail'))).toBe(false);
    expect(reported()).toEqual(['owner_password_admin_failed']);

    // (b) the record fails.
    spies.report.mockReset();
    log = [];
    r = await setOwnerPassword(
      fakeClient(
        { owner_password_target: TARGET, record_member_password_set: { error: { code: 'XX000' } } },
        log,
      ),
      ID,
      null,
      deps(log),
    );
    expect(r).toEqual({ status: 500, code: 'db_unavailable' });
    expect(log.some((l) => l.startsWith('sendEmail'))).toBe(false);
    expect(reported()).toEqual(['owner_password_record_failed']);

    // (c) the record is refused.
    spies.report.mockReset();
    log = [];
    r = await setOwnerPassword(
      fakeClient(
        { owner_password_target: TARGET, record_member_password_set: { error: { code: '42501' } } },
        log,
      ),
      ID,
      null,
      deps(log),
    );
    expect(r).toEqual({ status: 403, code: 'permission_denied' });
    expect(reported()).toEqual(['owner_password_record_refused']);

    for (const call of spies.report.mock.calls) expect(JSON.stringify(call)).not.toContain(PW);
    expect(spies.emit).not.toHaveBeenCalled();
  });

  it('S3 a failed email never fails the request', async () => {
    let log: string[] = [];
    const client = () =>
      fakeClient({ owner_password_target: TARGET, record_member_password_set: RECORD }, log);
    let r = await setOwnerPassword(
      client(),
      ID,
      null,
      deps(log, {
        sendEmail: (async () => ({ status: 'failed' })) as unknown as OwnerPasswordDeps['sendEmail'],
      }),
    );
    expect(r).toEqual({ status: 200, body: { password: PW, emailSent: false } });
    expect(spies.report).not.toHaveBeenCalled();

    log = [];
    r = await setOwnerPassword(
      client(),
      ID,
      null,
      deps(log, {
        sendEmail: (async () => {
          throw new Error('boom');
        }) as unknown as OwnerPasswordDeps['sendEmail'],
      }),
    );
    expect(r).toEqual({ status: 200, body: { password: PW, emailSent: false } });
    expect(reported()).toEqual(['owner_password_email_failed']);
  });

  it('S4 a refused check never reaches Auth', async () => {
    const cases: [Answer, unknown][] = [
      [{ error: { code: '42501' } }, { status: 403, code: 'permission_denied' }],
      [{ error: { code: 'P0002' } }, { status: 404, code: 'member_not_found' }],
      [{ error: { code: 'P0001' } }, { status: 403, code: 'password_target_refused' }],
      [{ error: { code: 'XX000' } }, { status: 500, code: 'db_unavailable' }],
      [{ data: null }, { status: 500, code: 'db_unavailable' }],
    ];
    for (const [answer, expected] of cases) {
      const log: string[] = [];
      const r = await setOwnerPassword(
        fakeClient({ owner_password_target: answer }, log),
        ID,
        null,
        deps(log),
      );
      expect(r).toEqual(expected);
      expect(log.map((l) => l.split(':')[0])).toEqual(['owner_password_target']);
    }
  });

  it('S5 the Auth admin password call lives only in the one narrow admin file', () => {
    const root = resolve(__dirname, '../../..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && !/\.(test|spec)\./.test(name)) files.push(p);
      }
    };
    walk(join(root, 'src'));
    const holding = (needle: string) =>
      files
        .filter((f) => readFileSync(f, 'utf8').includes(needle))
        .map((f) => relative(resolve(root, '..'), f));
    expect(holding('updateUserById')).toEqual(['app/src/server/auth/admin-auth.ts']);
    expect(holding('.auth.admin.')).toEqual(['app/src/server/auth/admin-auth.ts']);
    expect(readFileSync(join(root, 'src/server/users/owner-password.ts'), 'utf8')).toContain(
      "import { setMemberPassword } from '../auth/admin-auth';",
    );
  });
});
