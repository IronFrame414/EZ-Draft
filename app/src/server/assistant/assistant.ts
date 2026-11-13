// EZD-5602 Build step 11 (vault/plans/EZD-5602.md Decided "D-Body", "D-System", "D-Request", "D-Reply",
// "D-Run order", "D-Map", "D-Cost"; Q-0637 call path, usage and change format rows; Q-0638 limits, provider errors
// and rotation rows; AC-EZD-5602-1, -2, -5 to -12, -14): one Assistant prompt. The signed-in user's own key, one
// call slot, the sent drawing (send-list.ts), one provider call inside the request, the cost and one usage row.
// No job row, no operator key. Nothing is logged; no prompt, reply, key or body goes into an error or a report.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ModelObject } from '@ezdraft/geometry';
import { z } from 'zod';
import { MAX_CHANGES_PER_SAVE } from '../../lib/outbox/outbox';
import {
  ASSISTANT_MODELS,
  assistantCostMicroUsd,
  type AssistantModel,
} from '../../lib/assistant/cost';
import { callClaudeWithUserKey, CLAUDE_MODELS, type ClaudeRequest } from '../ai';
import type { Database } from '../db/database.types';
import { reportError } from '../errors/report';
import { loadModel } from '../model/model';
import type { PermissionContext } from '../permissions/context';
import { AiKeyConfigError } from './key-crypto';
import { stripPhoto } from './photo';
import { buildSentDrawing, drawingTooLarge } from './send-list';
import { loadUserAiKeyForCall, type UserAiKeyLoad } from './user-key';

export const ASSISTANT_PURPOSE = 'assistant.plan';
export const ASSISTANT_CALL_BUDGET_MS = 120_000;
export const ASSISTANT_MAX_TOKENS = 8_192;
export const ASSISTANT_BODY_MAX_BYTES = 4_000_000;
export const ASSISTANT_PROMPT_MAX_CHARS = 8_000;
export const ASSISTANT_HISTORY_MAX_TURNS = 20;
export const ASSISTANT_TURN_MAX_CHARS = 2_000;
export const ASSISTANT_SELECTED_MAX = 1_000;

export const ASSISTANT_SYSTEM_PROMPT =
  "You help edit a remodel floor plan in EZ Draft. The user's last message starts with the drawing as JSON. " +
  'Lengths and coordinates are in inches and +y is north. Each object is named by a ref: w for a wall, o for a ' +
  'door or window, r for a room, f for a floor. Refs are good for this message only. selected lists the refs ' +
  'the user has selected. Answer with one JSON object and nothing else: {"message": plain text for the user, ' +
  '"changes": a list of at most 100 changes}. A change adds, updates or removes a wall, door or window on the ' +
  'sent floor and uses only refs from the drawing. Leave changes empty when no change is asked for. Never use ' +
  'Markdown, links or images.';

type Env = Record<string, string | undefined>;

export type AssistantInput = {
  prompt: string;
  history: { role: 'user' | 'assistant'; text: string }[];
  model: AssistantModel;
  floorId: string;
  selectedIds: string[];
};

const LOCATION = 'server/assistant/assistant';

const inputSchema = z.strictObject({
  prompt: z
    .string()
    .max(ASSISTANT_PROMPT_MAX_CHARS)
    .refine((s) => s.trim().length > 0),
  history: z.array(
    z.strictObject({
      role: z.enum(['user', 'assistant']),
      text: z.string().min(1).max(ASSISTANT_TURN_MAX_CHARS),
    }),
  ),
  model: z.enum(ASSISTANT_MODELS),
  floorId: z.uuid(),
  selectedIds: z.array(z.uuid()).max(ASSISTANT_SELECTED_MAX),
});

// EZD-5603b X2: `photo` is the stripped JPEG (Decided "Body order").
type BodyResult =
  | { ok: true; input: AssistantInput; photo: Uint8Array | null }
  | { ok: false; code: 'invalid_input' | 'photo_unreadable' };

const INVALID: BodyResult = { ok: false, code: 'invalid_input' };

// The body's bytes, or null once more than ASSISTANT_BODY_MAX_BYTES have been read.
async function readCapped(request: Request): Promise<Uint8Array<ArrayBuffer> | null> {
  if (request.body === null) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > ASSISTANT_BODY_MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}

const alternates = (history: AssistantInput['history']) =>
  history.length % 2 === 0 &&
  history.every((turn, i) => turn.role === (i % 2 === 0 ? 'user' : 'assistant'));

export async function readAssistantBody(request: Request): Promise<BodyResult> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data')) return INVALID;

  let form: FormData;
  try {
    const bytes = await readCapped(request);
    if (bytes === null) return INVALID;
    form = await new Request('http://assistant.local', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: bytes,
    }).formData();
  } catch {
    return INVALID;
  }

  const names = [...form.keys()];
  if (names.some((n) => n !== 'request' && n !== 'photo')) return INVALID;
  if (form.getAll('request').length > 1 || form.getAll('photo').length > 1) return INVALID;
  const raw = form.get('request');
  if (typeof raw !== 'string') return INVALID;

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return INVALID;
  }
  const parsed = inputSchema.safeParse(json);
  if (!parsed.success || !alternates(parsed.data.history)) return INVALID;
  const input = parsed.data;

  let photo: Uint8Array | null = null;
  const part = form.get('photo');
  if (part !== null) {
    if (!(part instanceof File)) return INVALID;
    const stripped = await stripPhoto(new Uint8Array(await part.arrayBuffer()));
    if (!stripped.ok) return { ok: false, code: 'photo_unreadable' };
    photo = stripped.jpeg;
  }
  return {
    ok: true,
    photo,
    input: {
      prompt: input.prompt,
      history: input.history.slice(-ASSISTANT_HISTORY_MAX_TURNS),
      model: input.model,
      floorId: input.floorId.toLowerCase(),
      selectedIds: input.selectedIds.map((id) => id.toLowerCase()),
    },
  };
}

export type AssistantReply = { message: string; changes: unknown[] };

// Copied unchanged from the FENCE of app/src/server/ai/client.ts (D-Reply).
const FENCE = /^\s*```[a-zA-Z0-9_-]*[ \t]*\r?\n([\s\S]*?)\r?\n?```\s*$/;

const replySchema = z.strictObject({
  message: z.string(),
  changes: z.array(z.unknown()).max(MAX_CHANGES_PER_SAVE),
});

function holdsKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((v) => holdsKey(v, key));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => k === key || holdsKey(v, key));
  }
  return false;
}

export function parseAssistantReply(text: string): AssistantReply | null {
  try {
    const fenced = FENCE.exec(text);
    const parsed = replySchema.safeParse(JSON.parse(fenced ? fenced[1] : text));
    if (!parsed.success) return null;
    if (holdsKey(parsed.data.changes, 'roughOpeningMode')) return null;
    return { message: parsed.data.message, changes: parsed.data.changes };
  } catch {
    return null;
  }
}

export type AssistantSuccess = {
  message: string;
  changes: unknown[];
  refs: Record<string, string>;
  costMicroUsd: number;
  model: AssistantModel;
};

export type AssistantErrorBody = {
  error: { code: string; message_key: string };
  costMicroUsd?: number;
};

export type AssistantDeps = {
  env?: Env;
  budgetMs?: number;
  signal?: AbortSignal;
  // EZD-5603b X3: the stripped photo sent with this prompt only.
  photo?: Uint8Array | null;
};

type Answer = { status: number; body: AssistantSuccess | AssistantErrorBody };

const MESSAGE_KEYS: Readonly<Record<string, string>> = {
  assistant_provider_unavailable: 'error.assistant_unavailable',
  assistant_timeout: 'error.assistant_unavailable',
};

const fail = (status: number, code: string, costMicroUsd?: number): Answer => ({
  status,
  body: {
    error: { code, message_key: MESSAGE_KEYS[code] ?? `error.${code}` },
    ...(costMicroUsd === undefined ? {} : { costMicroUsd }),
  },
});

const FAILURES = {
  key_refused: [400, 'assistant_key_refused'],
  out_of_credit: [400, 'assistant_out_of_credit'],
  rate_limited: [429, 'assistant_provider_rate_limited'],
  request_refused: [502, 'assistant_request_refused'],
  unavailable: [502, 'assistant_provider_unavailable'],
  timeout: [504, 'assistant_timeout'],
} as const;

// The cost in dollars for numeric(10,6), exact from whole micro-dollars (D-Cost).
const dollars = (micro: number) =>
  `${Math.floor(micro / 1e6)}.${String(micro % 1e6).padStart(6, '0')}`;

const report = (code: string) =>
  reportError(new Error(code), { source: 'function', location: LOCATION });

type SlotRow = { slot_id: string | null; refused: string | null };

export async function runAssistantPrompt(
  client: SupabaseClient<Database>,
  ctx: PermissionContext,
  projectId: string,
  input: AssistantInput,
  deps: AssistantDeps = {},
): Promise<Answer> {
  const env = deps.env ?? process.env;

  let load: UserAiKeyLoad;
  try {
    load = await loadUserAiKeyForCall(client, { env });
  } catch (e) {
    if (!(e instanceof AiKeyConfigError)) throw e;
    await report(e.code);
    return fail(500, 'ai_key_unavailable');
  }
  if (load.kind === 'none') return fail(400, 'assistant_no_key');
  if (load.kind === 'undecryptable') return fail(400, 'assistant_key_refused');
  const key = load.key;

  const taken = await client.rpc('take_ai_assistant_slot');
  if (taken.error) throw new Error('take_ai_assistant_slot_failed');
  const slot = (taken.data as SlotRow[] | null)?.[0];
  if (slot?.refused === 'in_flight') return fail(429, 'assistant_busy');
  if (slot?.refused === 'rate_limited') return fail(429, 'assistant_rate_limited');
  if (!slot?.slot_id) throw new Error('take_ai_assistant_slot_failed');
  const slotId = slot.slot_id;

  try {
    const model = await loadModel(client, projectId, ctx);
    if (model === null) return fail(404, 'project_not_found');
    const built = buildSentDrawing(
      model.objects as unknown as ModelObject[],
      input.floorId,
      input.selectedIds,
    );
    if (built === null) return fail(400, 'invalid_input');
    const json = JSON.stringify(built.drawing);
    if (drawingTooLarge(json)) return fail(400, 'assistant_drawing_too_large');

    const request: ClaudeRequest = {
      purpose: ASSISTANT_PURPOSE,
      model: input.model,
      system: ASSISTANT_SYSTEM_PROMPT,
      maxTokens: ASSISTANT_MAX_TOKENS,
      messages: [
        ...input.history.map((turn) => ({
          role: turn.role,
          content: [{ type: 'text' as const, text: turn.text }],
        })),
        {
          role: 'user' as const,
          content: deps.photo
            ? [
                { type: 'text' as const, text: 'Drawing:\n' + json },
                {
                  type: 'image' as const,
                  image: { mediaType: 'image/jpeg' as const, data: deps.photo },
                },
                { type: 'text' as const, text: input.prompt },
              ]
            : [
                { type: 'text' as const, text: 'Drawing:\n' + json },
                { type: 'text' as const, text: input.prompt },
              ],
        },
      ],
    };
    const result = await callClaudeWithUserKey(
      {
        signal: deps.signal ?? new AbortController().signal,
        budgetMs: deps.budgetMs ?? ASSISTANT_CALL_BUDGET_MS,
      },
      request,
      key,
      { env },
    );

    if (!result.ok) {
      const [status, code] = FAILURES[result.failure];
      return fail(status, code);
    }
    if (result.usage === null) return fail(502, 'assistant_invalid_reply', 0);

    const costMicroUsd = assistantCostMicroUsd(input.model, result.usage);
    try {
      const recorded = await client.rpc('record_ai_usage', {
        p_model: CLAUDE_MODELS[input.model],
        // numeric(10,6) as exact text; the generated type says number.
        p_cost_usd: dollars(costMicroUsd) as unknown as number,
      });
      if (recorded.error) await report('ai_usage_write_failed');
    } catch {
      await report('ai_usage_write_failed');
    }

    const reply = parseAssistantReply(result.text);
    if (reply === null) return fail(502, 'assistant_invalid_reply', costMicroUsd);
    return {
      status: 200,
      body: {
        message: reply.message,
        changes: reply.changes,
        refs: built.refs,
        costMicroUsd,
        model: input.model,
      },
    };
  } finally {
    try {
      const released = await client.rpc('release_ai_assistant_slot', { p_slot_id: slotId });
      if (released.error) await report('ai_assistant_slot_release_failed');
    } catch {
      await report('ai_assistant_slot_release_failed');
    }
  }
}
