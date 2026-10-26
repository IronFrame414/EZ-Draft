// EZD-132 Step 6 (vault/plans/EZD-132.md Decided resumableEndpoint; R-017 #8): the address browser uploads
// go to. A Supabase cloud project (<ref>.supabase.co) has a direct Storage host, <ref>.storage.supabase.co;
// anything else (the local stack) serves Storage under its own origin. The input's path is ignored.
const CLOUD_HOST = /^([a-z0-9]+)\.supabase\.co$/;
const RESUMABLE_PATH = '/storage/v1/upload/resumable/sign';

export function resumableEndpoint(supabaseUrl: string): string {
  const url = new URL(supabaseUrl);
  const cloud = CLOUD_HOST.exec(url.hostname);
  if (cloud) return `https://${cloud[1]}.storage.supabase.co${RESUMABLE_PATH}`;
  return `${url.origin}${RESUMABLE_PATH}`;
}
