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
