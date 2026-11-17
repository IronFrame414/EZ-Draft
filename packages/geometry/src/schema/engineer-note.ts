// EZD-234 Build (Q-0704 03-data-model row 1 "engineer_note"; Q-0708 "Engineer letter on file"): the record behind
// the "Engineer required" warning. `geometry` is the wall's line at the time; the note is made with empty name and
// approval text when the warning is raised, and `letterOnFile` can be true only when both are filled.
import { z } from 'zod';
import { levelSchema, pointSchema } from './common';

export const ENGINEER_NOTE_ACTIONS = ['delete', 'demo', 'opening'] as const;
export type EngineerNoteAction = (typeof ENGINEER_NOTE_ACTIONS)[number];

export const engineerNoteDataSchema = z
  .strictObject({
    geometry: z.strictObject({ start: pointSchema, end: pointSchema }),
    status: z.literal('existing'),
    level: levelSchema,
    attributes: z.strictObject({
      wallId: z.uuid(),
      action: z.enum(ENGINEER_NOTE_ACTIONS),
      engineerName: z.string(),
      approvedText: z.string(),
      fileId: z.uuid().nullable(),
      letterOnFile: z.boolean(),
    }),
  })
  .refine(
    (d) =>
      !d.attributes.letterOnFile ||
      (d.attributes.engineerName.trim() !== '' && d.attributes.approvedText.trim() !== ''),
  );
export type EngineerNoteData = z.infer<typeof engineerNoteDataSchema>;
