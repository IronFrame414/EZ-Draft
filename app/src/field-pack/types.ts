// EZD-1404 (S17 Field pack): the field pack the phone shows (GET /api/projects/<id>/field-pack;
// server/field-pack/read.ts). EZD-1409 adds the pack's tasks (S17 Tab: Tasks, Task row, Data shown "field_task").
export type FieldPackRoom = { id: string; name: string };

// One published or done task of the pack (EZD-1409). Text in both languages; the phone picks by the user's language
// (tasks-view.ts taskText). done is null while the task is open.
export type FieldPackTask = {
  id: string;
  roomId: string | null;
  room: string;
  phase: string;
  phasePosition: number;
  position: number;
  textEn: string;
  textEs: string | null;
  done: { by: string | null; at: string } | null;
  photos: number;
};

export type FieldPack = {
  issueId: string;
  // The sent version the pack was issued from ("Version N"); null for a version with no send number
  // (vault/build/assumptions.md EZD-1404).
  revision: { kind: 'version' | 'rev'; no: number } | null;
  issuedAt: string;
  note: string | null;
  rooms: FieldPackRoom[];
  // The pack's tasks that are still open (EZD-1409: published, not done).
  openTasks: number;
  // EZD-1409: the pack's published and done tasks in phase order. Missing in a pack this phone stored before
  // EZD-1409 (lib/pwa/project-cache.ts), read as none.
  tasks?: FieldPackTask[];
};

export type FieldPackView = {
  projectName: string;
  clientName: string | null;
  pack: FieldPack | null;
};
