// EZD-126 (S06:81; AC-EZD-126-5): the browser side of GET /api/projects/[id]/people. Never throws: any status but
// 200, a body of another shape or a thrown fetch is `{ ok: false }`. No zod (it loads with the lock UI).
export type Person = { name: string | null; initials: string };
export type PeopleResult = { ok: true; people: Array<{ appUserId: string } & Person> } | { ok: false };

const isPerson = (v: unknown): v is { appUserId: string } & Person => {
  const o = v as Record<string, unknown> | null;
  return (
    typeof o === 'object' &&
    o !== null &&
    typeof o.appUserId === 'string' &&
    (o.name === null || typeof o.name === 'string') &&
    typeof o.initials === 'string'
  );
};

export async function fetchPeople(
  projectId: string,
  ids: readonly string[],
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<PeopleResult> {
  const url = `/api/projects/${encodeURIComponent(projectId)}/people?ids=${ids.map(encodeURIComponent).join(',')}`;
  try {
    const res = await (opts.fetchImpl ?? fetch)(url, { cache: 'no-store' });
    if (res.status !== 200) return { ok: false };
    const body = (await res.json()) as { people?: unknown } | null;
    const people = body?.people;
    if (!Array.isArray(people) || !people.every(isPerson)) return { ok: false };
    return {
      ok: true,
      people: people.map((p) => ({ appUserId: p.appUserId, name: p.name, initials: p.initials })),
    };
  } catch {
    return { ok: false };
  }
}
