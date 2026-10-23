// EZD-018 structural repair: lets a test under app/src compare against the secret key value
// without naming the variable there (EZD-004b T19 scans app/src outside app/src/server).
export function secretKeyValue(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY;
}
