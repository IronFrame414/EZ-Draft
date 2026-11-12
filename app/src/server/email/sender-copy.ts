// EZD-389 (Q-0701; phase-02.md row EZD-389): the one switch for the acting user's copy. false stops every copy.
export const SENDER_COPY_ON = true;

export function senderCopyOn(): boolean {
  return SENDER_COPY_ON;
}
