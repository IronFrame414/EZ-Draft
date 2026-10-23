// EZD-021 Step 1 (vault/plans/EZD-021.md): the AI client's request and result shapes. AI calls run only inside
// background jobs, so every public function takes the job context. No dollar cost here: callers turn `usage`
// into money (R24 #18; 03 rule 2).
import type { JobContext } from '../jobs/registry';

export type AiProvider = 'anthropic' | 'gemini' | 'openai' | 'bfl';
export type ImageEditProvider = Exclude<AiProvider, 'anthropic'>;
export type ClaudeModelAlias = 'opus' | 'sonnet' | 'haiku';
export type AiImage = { mediaType: 'image/png' | 'image/jpeg' | 'image/webp'; data: Uint8Array };
export type ClaudeContent = { type: 'text'; text: string } | { type: 'image'; image: AiImage };

export type ClaudeRequest = {
  purpose: string; // ^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$, e.g. 'test.echo', 'panel.label_read'
  model: ClaudeModelAlias;
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: ClaudeContent[] }>; // 1+, first role 'user'
  maxTokens: number; // integer >= 1
  temperature?: number; // 0-1
};

export type ClaudeResult = {
  text: string;
  modelId: string;
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number };
  requestId: string | null;
  mode: 'stub' | 'live';
};

export type ImageEditRequest = {
  purpose: string;
  provider: ImageEditProvider;
  model: string; // provider model id, ^[a-z0-9][a-z0-9.\-]{0,99}$ (it goes into a URL path)
  instruction: string; // non-empty
  image: AiImage; // exactly one input image
};

export type ImageEditResult = {
  image: AiImage;
  provider: ImageEditProvider;
  modelId: string;
  usage: { inputTokens: number | null; outputTokens: number | null; images: number };
  requestId: string | null;
  mode: 'stub' | 'live';
};

export type AiJobContext = Pick<
  JobContext<unknown, unknown>,
  'job' | 'signal' | 'timeLeft' | 'sleep'
>;
