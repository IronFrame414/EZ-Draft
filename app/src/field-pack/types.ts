// EZD-1404: the field pack the phone shows (GET /api/projects/<id>/field-pack; server/field-pack/read.ts).
export type FieldPackRoom = { id: string; name: string };

export type FieldPack = {
  issueId: string;
  // The sent version the pack was issued from ("Version N"); null for a version with no send number
  // (vault/build/assumptions.md EZD-1404).
  revision: { kind: 'version' | 'rev'; no: number } | null;
  issuedAt: string;
  note: string | null;
  rooms: FieldPackRoom[];
  // Open tasks the pack carries (vault/build/assumptions.md EZD-1404: every issued task until field_task exists).
  openTasks: number;
};

export type FieldPackView = {
  projectName: string;
  clientName: string | null;
  pack: FieldPack | null;
};
