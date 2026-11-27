// EZD-1415 (S17b Field measure; Permissions "Send field measurement to create and send; View projects to view"):
// read and save one project's field measure session (field_measure_session, one row per project). Reads go through
// the caller's session client and RLS; a project with no row yet has the Building alone. Saves go through
// save_field_measure_session, which checks Send field measurement and project scope
// (supabase/migrations/…_create_field_measure_session.sql). Room fields are checked here with roomsSchema.
// EZD-1419: a save while the rooms are sent is refused (read-only until the office reopens them).
import { initialRooms, roomsSchema, type FieldRoom } from '../../field-measure/rooms';
import type { Json } from '../db/database.types';
import type { DbClient } from '../storage/objects';

// EZD-1417: sentAt is when the rooms were sent to the office (S17b States "sent"), null while not sent.
// EZD-2002 (AC-EZD-2002-2): savedAt is when the rooms were last saved (field_measure_session.updated_at, the
// database's clock), null while nothing is saved; the phone compares it with the save time its own copy carries.
export type FieldMeasureView = {
  projectName: string;
  rooms: FieldRoom[];
  sentAt: string | null;
  savedAt: string | null;
};

/** Thrown for the refusals the route answers with 403, 404, 400 or (EZD-1419, rooms sent) 409. */
export class FieldMeasureError extends Error {
  constructor(readonly code: 'permission_denied' | 'not_found' | 'invalid_input' | 'sent') {
    super(code);
    this.name = 'FieldMeasureError';
  }
}

/**
 * The project's name and its rooms, or null when the project is missing or out of the caller's scope. A stored
 * value that no longer reads as rooms starts again from the Building alone.
 */
export async function readFieldMeasure(
  client: DbClient,
  projectId: string,
): Promise<FieldMeasureView | null> {
  const project = await client.from('project').select('name').eq('id', projectId).maybeSingle();
  if (project.error) throw project.error;
  if (project.data === null) return null;
  const session = await client
    .from('field_measure_session')
    .select('rooms, sent_at, updated_at')
    .eq('project_id', projectId)
    .maybeSingle();
  if (session.error) throw session.error;
  const parsed = session.data === null ? null : roomsSchema.safeParse(session.data.rooms);
  const rooms = parsed?.success ? parsed.data : initialRooms();
  return {
    projectName: project.data.name,
    rooms,
    sentAt: session.data?.sent_at ?? null,
    savedAt: session.data?.updated_at ?? null,
  };
}

/**
 * Saves the rooms whole. Throws FieldMeasureError('invalid_input') before the database for a bad room list.
 * EZD-2002: answers when the saved rooms were stored (updated_at), or null when that read fails (the rooms are saved).
 */
export async function saveFieldMeasure(
  client: DbClient,
  projectId: string,
  rooms: unknown,
): Promise<string | null> {
  const parsed = roomsSchema.safeParse(rooms);
  if (!parsed.success) throw new FieldMeasureError('invalid_input');
  const { error } = await client.rpc('save_field_measure_session', {
    p_project: projectId,
    p_rooms: parsed.data as unknown as Json,
  });
  if (error) {
    if (error.code === '42501') throw new FieldMeasureError('permission_denied');
    if (error.code === 'P0002') throw new FieldMeasureError('not_found');
    if (error.code === '22023') throw new FieldMeasureError('invalid_input');
    if (error.code === '55000') throw new FieldMeasureError('sent');
    throw error;
  }
  const saved = await client
    .from('field_measure_session')
    .select('updated_at')
    .eq('project_id', projectId)
    .maybeSingle();
  return saved.error ? null : (saved.data?.updated_at ?? null);
}

/**
 * EZD-1419 (S17b States "sent (read-only until reopened by office)"): the office (Approve field measurements)
 * reopens sent rooms through reopen_field_measure_session. 'not_sent' when there was nothing sent to reopen.
 */
export async function reopenFieldMeasure(
  client: DbClient,
  projectId: string,
): Promise<'reopened' | 'not_sent'> {
  const { data, error } = await client.rpc('reopen_field_measure_session', { p_project: projectId });
  if (error) {
    if (error.code === '42501') throw new FieldMeasureError('permission_denied');
    if (error.code === 'P0002') throw new FieldMeasureError('not_found');
    throw error;
  }
  return (data as { status?: string } | null)?.status === 'reopened' ? 'reopened' : 'not_sent';
}
