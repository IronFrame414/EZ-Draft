// EZD-1422 (S01 Input source; Q-0204): the field measure request as the browser sees it after Create or Resend.
// `link` is the project's phone Field measure screen (S17b); emailSent is false when only the email failed.
export type FieldMeasureRequestSent = { sentTo: string; link: string; emailSent: boolean };
