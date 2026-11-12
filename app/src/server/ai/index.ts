// EZD-021 (vault/plans/EZD-021.md): what job handlers import from the AI client. AI runs in jobs, with one exception: app/src/server/ai/ is imported only by app/src/server/jobs/** and app/src/server/assistant/** (and tests), never a 'use client' file (T19).
export { callClaude, callClaudeJson, editImage } from './client';
// EZD-5602 Build step 8 (vault/plans/EZD-5602.md "D-Call"; Q-0637 call path): the assistant's user-key call.
export {
  callClaudeWithUserKey,
  type UserKeyCallContext,
  type UserKeyCallResult,
  type UserKeyFailure,
} from './client';
export { CLAUDE_MODELS } from './config';
export { AiError } from './errors';
// EZD-5601 Step 11 (vault/plans/EZD-5601.md): the user-key check, for app/src/server/assistant/ (Q-0637).
export {
  AI_KEY_CHECK_BUDGET_MS,
  checkAnthropicKey,
  UserAiKey,
  type KeyCheckResult,
} from './key-check';
export { classifyAnthropicError, type AnthropicErrorClass } from './providers/anthropic';
export type {
  AiImage,
  AiJobContext,
  AiProvider,
  ClaudeContent,
  ClaudeModelAlias,
  ClaudeRequest,
  ClaudeResult,
  ImageEditProvider,
  ImageEditRequest,
  ImageEditResult,
} from './types';
