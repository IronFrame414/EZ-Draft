// EZD-004b T5 (vault/plans/EZD-004b.md section 4): the local stack's services answer.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

describe('EZD-004b local services', () => {
  const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const publishable = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;
  const secret = () => process.env.SUPABASE_SECRET_KEY as string;

  it('EZD-004b T5a auth service answers', async () => {
    const res = await fetch(`${url()}/auth/v1/health`, { headers: { apikey: publishable() } });
    expect(res.status).toBe(200);
  });

  it('EZD-004b T5b storage service lists buckets', async () => {
    const client = createClient(url(), secret(), { auth: { persistSession: false } });
    const { data, error } = await client.storage.listBuckets();
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('EZD-004b T5c realtime channel subscribes', async () => {
    const client = createClient(url(), publishable(), { auth: { persistSession: false } });
    const status = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve('TIMEOUT'), 10000);
      client.channel('ezd-004-probe').subscribe((s) => {
        if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
          clearTimeout(timer);
          resolve(s);
        }
      });
    });
    await client.removeAllChannels();
    expect(status).toBe('SUBSCRIBED');
  });

  it('EZD-004b T5d mail catcher address is reported', () => {
    const r = spawnSync(
      path.join(repo, 'node_modules', '.bin', 'supabase'),
      ['status', '-o', 'json'],
      { cwd: repo, encoding: 'utf8' },
    );
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout.trim()) as Record<string, unknown>;
    // Pinned CLI 2.121.0 prints MAILPIT_URL (and INBUCKET_URL, same address) for the mail catcher.
    const mail = json.MAILPIT_URL;
    expect(typeof mail).toBe('string');
    expect((mail as string).trim()).not.toBe('');
  });
});
