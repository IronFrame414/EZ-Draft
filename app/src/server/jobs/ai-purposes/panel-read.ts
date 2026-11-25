// EZD-606 (S06 Controls "Existing panel ... panel label photo (AI reads brand, rating, spaces; user confirms),
// existing circuit list (typed or read from directory photo; user confirms)"; S06 Decisions "AI-read panel label and
// directory values must be confirmed before use"; Q-0637 photo row "The server takes at most 4,000,000 bytes of JPEG
// by magic bytes"; vault/build/assumptions.md EZD-606): the two panel photo reads. The photo is a panel_photo
// source_file in the sources bucket (the route checks the row; the runner checks the path is inside the job). Claude
// answers values the dialog shows for confirmation; nothing is written. A missing, oversized or non-JPEG/PNG photo,
// or a reply with nothing in it, answers `unreadable`. Safe to run twice: it reads the photo and writes nothing.
import { z } from 'zod';
import { sniffPhotoKind } from '../../../lib/assistant/photo-rules';
import {
  CIRCUIT_NAME_MAX,
  DIRECTORY_MAX_CIRCUITS,
  PANEL_DIRECTORY_PURPOSE,
  PANEL_LABEL_PURPOSE,
  PANEL_MAX_AMPS,
  PANEL_MAX_SPACES,
  PANEL_PHOTO_MAX_BYTES,
  PANEL_PHOTO_TYPES,
  panelDirectoryOutputSchema,
  panelLabelOutputSchema,
  type DirectoryCircuit,
  type PanelDirectoryOutput,
  type PanelLabelOutput,
  type PanelPhotoType,
} from '../../../lib/electrical/panel-read';
import { callClaudeJson, type AiJobContext } from '../../ai';
import { createJobsDbClient } from '../db';
import { JobError } from '../errors';
import { storagePathSchema, type StoragePath } from '../storage-path';
import type { AiPurpose } from './index';

export type PanelPhotoInput = { image: StoragePath; mediaType: PanelPhotoType };

type ReadImage = (target: StoragePath) => Promise<Uint8Array | null>;

const READ_KEY = '__ezdPanelReadImage';

/** Test seam: how the purposes read the stored photo (null restores the sources bucket read). */
export function setPanelImageReader(fn: ReadImage | null): void {
  const g = globalThis as unknown as Record<string, ReadImage | undefined>;
  if (fn === null) delete g[READ_KEY];
  else g[READ_KEY] = fn;
}

const bucketRead: ReadImage = async (target) => {
  const { data, error } = await createJobsDbClient()
    .storage.from(target.bucket)
    .download(target.path);
  if (error) {
    const status =
      (error as { status?: unknown; statusCode?: unknown }).status ??
      (error as { statusCode?: unknown }).statusCode;
    if (Number(status) === 404 || Number(status) === 400) return null;
    throw new JobError('storage_unavailable', { retry: true });
  }
  return new Uint8Array(await data.arrayBuffer());
};

const inputSchema = z
  .object({
    image: storagePathSchema.refine((p) => p.bucket === 'sources'),
    mediaType: z.enum(PANEL_PHOTO_TYPES),
  })
  .strict();

/** The photo's bytes when it is a JPEG or PNG within the limit, with the type its first bytes show; else null. */
async function readPhoto(
  input: PanelPhotoInput,
): Promise<{ data: Uint8Array; mediaType: PanelPhotoType } | null> {
  const read =
    (globalThis as unknown as Record<string, ReadImage | undefined>)[READ_KEY] ?? bucketRead;
  const bytes = await read(input.image);
  if (bytes === null || bytes.byteLength === 0 || bytes.byteLength > PANEL_PHOTO_MAX_BYTES)
    return null;
  const kind = sniffPhotoKind(bytes.subarray(0, 12));
  if (kind === 'jpeg') return { data: bytes, mediaType: 'image/jpeg' };
  if (kind === 'png') return { data: bytes, mediaType: 'image/png' };
  return null;
}

// Claude answers each value or null; a value out of range is dropped, not refused.
const looseInt = (max: number) =>
  z
    .union([z.number(), z.string()])
    .nullable()
    .optional()
    .transform((v) => {
      if (v === null || v === undefined) return null;
      const n = typeof v === 'number' ? v : Number(v.replace(/\s*a(mps?)?$/i, '').trim());
      return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
    });

const labelReplySchema = z.object({
  brand: z
    .string()
    .nullable()
    .optional()
    .transform((s) => {
      const t = (s ?? '').trim();
      return t === '' || t.length > 80 ? null : t;
    }),
  rating: looseInt(PANEL_MAX_AMPS),
  spaces: looseInt(PANEL_MAX_SPACES),
});

const directoryReplySchema = z.object({
  circuits: z
    .array(
      z.object({
        space: looseInt(PANEL_MAX_SPACES),
        name: z.string().nullable().optional(),
        breaker: looseInt(PANEL_MAX_AMPS),
        poles: z.union([z.number(), z.string()]).nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
});

export const PANEL_LABEL_PROMPT = [
  'You read the label inside the door of a residential electrical panel (load center) for a contractor.',
  'Give the manufacturer brand, the panel ampere rating and the number of breaker spaces.',
  'Use null for anything the label does not show. Answer with JSON only:',
  '{"brand":"…","rating":200,"spaces":40}',
].join('\n');

export const PANEL_DIRECTORY_PROMPT = [
  'You read the circuit directory of a residential electrical panel for a contractor.',
  'List every filled line: the space number, the circuit name as written, the breaker amps and the poles',
  '(2 for a double breaker, else 1). Leave out blank lines. Answer with JSON only:',
  '{"circuits":[{"space":1,"name":"Range","breaker":40,"poles":2}]}',
].join('\n');

async function ask<T>(
  ctx: AiJobContext,
  purpose: string,
  prompt: string,
  photo: { data: Uint8Array; mediaType: PanelPhotoType },
  schema: z.ZodType<T>,
): Promise<T> {
  const { data } = await callClaudeJson(
    ctx,
    {
      purpose,
      model: 'sonnet',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image', image: photo },
          ],
        },
      ],
      maxTokens: 2000,
    },
    schema,
  );
  return data;
}

export const panelLabelPurpose: AiPurpose<PanelPhotoInput, PanelLabelOutput> = {
  purpose: PANEL_LABEL_PURPOSE,
  input: inputSchema,
  output: panelLabelOutputSchema,
  async run(ctx, input) {
    const photo = await readPhoto(input);
    if (photo === null) return { status: 'unreadable' };
    const label = await ask(ctx, PANEL_LABEL_PURPOSE, PANEL_LABEL_PROMPT, photo, labelReplySchema);
    return label.brand === null && label.rating === null && label.spaces === null
      ? { status: 'unreadable' }
      : { status: 'read', label };
  },
};

export const panelDirectoryPurpose: AiPurpose<PanelPhotoInput, PanelDirectoryOutput> = {
  purpose: PANEL_DIRECTORY_PURPOSE,
  input: inputSchema,
  output: panelDirectoryOutputSchema,
  async run(ctx, input) {
    const photo = await readPhoto(input);
    if (photo === null) return { status: 'unreadable' };
    const reply = await ask(
      ctx,
      PANEL_DIRECTORY_PURPOSE,
      PANEL_DIRECTORY_PROMPT,
      photo,
      directoryReplySchema,
    );
    const seen = new Set<number>();
    const circuits: DirectoryCircuit[] = [];
    for (const c of reply.circuits ?? []) {
      if (c.space === null || c.breaker === null || seen.has(c.space)) continue;
      seen.add(c.space);
      const poles = Number(c.poles) === 2 ? 2 : 1;
      circuits.push({
        space: c.space,
        name: (c.name ?? '').trim().slice(0, CIRCUIT_NAME_MAX),
        breaker: c.breaker,
        poles,
      });
      if (circuits.length === DIRECTORY_MAX_CIRCUITS) break;
    }
    circuits.sort((a, b) => a.space - b.space);
    return circuits.length === 0 ? { status: 'unreadable' } : { status: 'read', circuits };
  },
};
