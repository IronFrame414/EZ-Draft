// EZD-031 Interface contract: refusals are thrown as TrialError (key and base-URL refusals stay EZD-021's AiError).
export type TrialErrorCode =
  | 'args_invalid'
  | 'manifest_invalid'
  | 'models_invalid'
  | 'prices_invalid'
  | 'input_too_large'
  | 'input_unsupported_type'
  | 'resume_invalid'
  | 'live_refused_ci'
  | 'live_refused_no_tty'
  | 'live_refused_no_cap'
  | 'live_needs_5_rooms';

export class TrialError extends Error {
  readonly code: TrialErrorCode;
  readonly detail: string | null;
  constructor(code: TrialErrorCode, detail?: string) {
    super(code);
    this.name = 'TrialError';
    this.code = code;
    this.detail = detail ?? null;
  }
}
