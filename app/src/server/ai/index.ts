// EZD-021 (vault/plans/EZD-021.md): what job handlers import from the AI client. AI runs only inside jobs.
export { callClaude, callClaudeJson, editImage } from './client';
export { AiError } from './errors';
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
