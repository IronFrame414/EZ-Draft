// EZD-127 (04 Header card "N to review" pill): the browser side of GET /api/projects/[id]/review. Null on any
// failure (network, a status other than 200, or an answer that does not read).
import {
  isReviewSource,
  reviewUrl,
  type ReviewGroup,
  type ReviewSummary,
} from '../../lib/review/sources';

export type ReviewApi = {
  summary: (
    projectId: string,
    withList: boolean,
    signal?: AbortSignal,
  ) => Promise<ReviewSummary | null>;
};

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

export function readSummary(body: unknown): ReviewSummary | null {
  if (typeof body !== 'object' || body === null) return null;
  const { count, groups } = body as { count?: unknown; groups?: unknown };
  if (!isCount(count)) return null;
  if (groups === undefined) return { count };
  if (!Array.isArray(groups)) return null;
  const out: ReviewGroup[] = [];
  for (const g of groups as unknown[]) {
    if (typeof g !== 'object' || g === null) return null;
    const { source, count: n } = g as { source?: unknown; count?: unknown };
    if (!isReviewSource(source) || !isCount(n)) return null;
    out.push({ source, count: n });
  }
  return { count, groups: out };
}

export function reviewHttpApi(fetchImpl: typeof fetch = (...a) => fetch(...a)): ReviewApi {
  return {
    async summary(projectId, withList, signal) {
      try {
        const res = await fetchImpl(reviewUrl(projectId, withList), { cache: 'no-store', signal });
        if (res.status !== 200) return null;
        return readSummary(await res.json());
      } catch {
        return null;
      }
    },
  };
}
