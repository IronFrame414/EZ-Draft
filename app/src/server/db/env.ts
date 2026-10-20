import { z } from 'zod';

const publicDbEnvSchema = z.object({
  url: z.url({ protocol: /^https?$/ }),
  publishableKey: z.string().trim().min(1),
});

export function readPublicDbEnv(): { url: string; publishableKey: string } {
  return publicDbEnvSchema.parse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

const gateSecretSchema = z.string().min(43);

// EZD-007c Step 2 (Q-0087 (ii)): the server-only PostgREST gate secret, read per call. A missing or
// short value throws a fixed code, never the Zod error, so the value cannot reach a message or a log.
export function serverGateSecret(): string {
  const parsed = gateSecretSchema.safeParse(process.env.SUPABASE_API_GATE_SECRET);
  if (!parsed.success) throw new Error('api_gate_secret_not_set');
  return parsed.data;
}
