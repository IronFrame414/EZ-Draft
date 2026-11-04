// EZD-171 (vault/plans/EZD-171.md D8): the browser side of the cloud check page. Values only.
export type CloudCheckSession = {
  signedIn: boolean;
  tenantClaim: boolean;
  gate: 'accepted' | 'refused' | 'error' | 'not_checked' | 'client_unavailable';
};

export type CloudCheckRead = {
  vercelEnv: string | null;
  clientIp: string | null;
  session: CloudCheckSession;
};

export type CloudCheckResult =
  { plain: CloudCheckRead; withFakeHeader: CloudCheckRead } | { error: 'fetch_failed' };

export const CLOUD_CHECK_READ_PATH = '/dev/cloud-check/read';
export const FAKE_FORWARDED_FOR = '203.0.113.9';

async function read(
  fetchImpl: typeof fetch,
  headers?: Record<string, string>,
): Promise<CloudCheckRead> {
  const res = await fetchImpl(
    CLOUD_CHECK_READ_PATH,
    headers ? { cache: 'no-store', headers } : { cache: 'no-store' },
  );
  if (res.status !== 200) throw new Error('cloud_check_failed');
  return (await res.json()) as CloudCheckRead;
}

export async function runCloudCheck(fetchImpl: typeof fetch = fetch): Promise<CloudCheckResult> {
  try {
    const plain = await read(fetchImpl);
    const withFakeHeader = await read(fetchImpl, { 'x-forwarded-for': FAKE_FORWARDED_FOR });
    return { plain, withFakeHeader };
  } catch {
    return { error: 'fetch_failed' };
  }
}
