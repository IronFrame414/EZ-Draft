// EZD-1404 (phase-14.md EZD-1404 "field_pack_issue table ... with a seeded issue for tests"): seeds an issued field
// pack for one project of a test company (never tenant 1; vault/build/assumptions.md EZD-1404): a sent version
// (is_sent, version_no) whose model holds a floor and one room per name, and a field_pack_issue row pointing at it.
// Written with the admin connection, as Issue field pack (EZD-1421) is not built yet. Used by the field pack
// browser tests and the database and route tests (later field pack tickets reuse it).
import { randomUUID } from 'node:crypto';
import { CURRENT_SCHEMA_VERSION, newRoomAttributes } from '@ezdraft/geometry';
import type { Sql } from 'postgres';

export type SeededFieldPack = {
  issueId: string;
  versionId: string;
  rooms: Array<{ id: string; name: string }>;
};

export async function seedFieldPack(
  sql: Sql,
  o: {
    tenantId: string;
    projectId: string;
    rooms?: string[];
    versionNo?: number;
    note?: string | null;
    taskCount?: number;
    issuedAt?: string;
  },
): Promise<SeededFieldPack> {
  const floor = randomUUID();
  const rooms = (o.rooms ?? ['Kitchen']).map((name) => ({ id: randomUUID(), name }));
  const objects = [
    {
      id: floor,
      type: 'floor',
      schema_version: CURRENT_SCHEMA_VERSION,
      data: { name: 'Floor 1', order: 1 },
    },
    ...rooms.map((r, i) => ({
      id: r.id,
      type: 'room',
      schema_version: CURRENT_SCHEMA_VERSION,
      data: {
        geometry: {
          boundary: [
            { x: i * 200, y: 0 },
            { x: i * 200 + 156, y: 0 },
            { x: i * 200 + 156, y: 156 },
            { x: i * 200, y: 156 },
          ],
        },
        status: 'new',
        level: floor,
        attributes: newRoomAttributes(r.name),
        closureOverride: null,
      },
    })),
  ];
  const versionNo = o.versionNo ?? 1;
  const [version] = await sql<{ id: string }[]>`
    insert into public.model_version
      (project_id, tenant_id, model_json, schema_version, is_sent, version_no, sent_to, sent_at, cause)
    values (${o.projectId}::uuid, ${o.tenantId}::uuid, ${sql.json({ objects } as never)},
      ${CURRENT_SCHEMA_VERSION}, true, ${versionNo}, 'Client', now(), 'send')
    returning id`;
  const tasks = Array.from({ length: o.taskCount ?? 0 }, () => randomUUID());
  const [issue] = await sql<{ id: string }[]>`
    insert into public.field_pack_issue (tenant_id, project_id, model_version_id, task_ids, note, issued_at)
    values (${o.tenantId}::uuid, ${o.projectId}::uuid, ${version!.id}::uuid, ${tasks}::uuid[],
      ${o.note ?? null}, ${o.issuedAt ?? new Date().toISOString()}::timestamptz)
    returning id`;
  return { issueId: issue!.id, versionId: version!.id, rooms };
}
