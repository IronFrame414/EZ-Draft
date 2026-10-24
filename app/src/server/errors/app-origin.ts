// EZD-024 Step 5 (vault/plans/EZD-024.md): the app address alert emails link to (planner's choice).
type Env = Record<string, string | undefined>;

export function appOrigin(env: Env): string {
  if (env.VERCEL_ENV === 'production') return 'https://ezdraft.ezcontractorbinder.com'; // R24 #1
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return 'http://localhost:3000';
}
