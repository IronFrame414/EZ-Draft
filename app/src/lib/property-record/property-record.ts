// EZD-711 (S01 Property appraiser link "Paste link; app reads parcel number, owner, legal description, year built,
// living area; user confirms each field ... Year built before 1978 sets the lead flag"; 03c property_record; S13
// Controls; AC-EZD-711-1, -2): the five fields an appraiser page gives, the lead flag rule and the confirmed-fields
// body the browser sends. Pure: browser and server.
import * as z from 'zod/mini';
import {
  LEGAL_DESCRIPTION_MAX,
  LIVING_AREA_MAX,
  OWNER_MAX,
  PARCEL_NO_MAX,
  SOURCE_URL_MAX,
  YEAR_BUILT_MAX,
  YEAR_BUILT_MIN,
} from './fields';

// The fields, limits, lead rule and helpers live in fields.ts (no zod), which the browser screens import directly.
export * from './fields';

const text = (max: number) =>
  z.nullable(
    z.pipe(
      z.pipe(
        z.pipe(
          z.string(),
          z.transform((s: string) => s.trim()),
        ),
        z.string().check(z.maxLength(max)),
      ),
      z.transform((s: string) => (s === '' ? null : s)),
    ),
  );

// A value as read (AI output) or as confirmed: every field may be missing.
export const propertyFieldsSchema = z.object({
  parcelNo: text(PARCEL_NO_MAX),
  owner: text(OWNER_MAX),
  legalDescription: text(LEGAL_DESCRIPTION_MAX),
  yearBuilt: z.nullable(z.int().check(z.gte(YEAR_BUILT_MIN), z.lte(YEAR_BUILT_MAX))),
  livingArea: z.nullable(z.int().check(z.gte(0), z.lte(LIVING_AREA_MAX))),
});

// The body that saves a project's record: only the confirmed fields, the rest null (S01 "user confirms each field").
export const confirmedRecordSchema = z.strictObject({
  fields: propertyFieldsSchema,
  sourceUrl: z.nullable(z.string().check(z.trim(), z.maxLength(SOURCE_URL_MAX))),
});
export type ConfirmedRecord = z.infer<typeof confirmedRecordSchema>;

// What a read job answers: the fields read, or that the page could not be read (S01 "On read failure, offer
// 'Paste page text' or 'Paste screenshot'").
export const appraiserReadOutputSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('read'), fields: propertyFieldsSchema }),
  z.object({ status: z.literal('unreadable') }),
]);
export type AppraiserReadOutput = z.infer<typeof appraiserReadOutputSchema>;
