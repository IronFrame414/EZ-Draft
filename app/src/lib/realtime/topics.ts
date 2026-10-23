// EZD-018 Step 5 (vault/plans/EZD-018.md): Realtime topic names. Topics are project:<project_id> and
// user:<app_user_id> with a lower-case UUID; the database refuses any other form (Step 1).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type TopicKind = 'project' | 'user';

export function projectTopic(id: string): string {
  return `project:${id.toLowerCase()}`;
}

export function userTopic(id: string): string {
  return `user:${id.toLowerCase()}`;
}

export function parseTopic(topic: string): { kind: TopicKind; id: string } | null {
  const i = topic.indexOf(':');
  if (i < 0) return null;
  const kind = topic.slice(0, i);
  const id = topic.slice(i + 1);
  if ((kind !== 'project' && kind !== 'user') || !UUID_RE.test(id)) return null;
  return { kind, id };
}
