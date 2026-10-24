// EZD-025 Step 4 (vault/plans/EZD-025.md; Interface contract): the source project. A postgres.js client to the
// database (max 2, opened on the first call) for `storage.objects`, the migration version and `backup_run`;
// supabase-js Storage with the secret key for downloads. Object names never leave this module except to the
// caller; nothing here prints.
//
// Times of `storage.objects.updated_at` keep their microseconds as text (`updatedAtText`, `files_cursor_text`) and
// go back to the database as `text::timestamptz`, because a JavaScript Date (and postgres.js's timestamptz
// parameter) holds milliseconds only and the cursor must equal the largest `updated_at` exactly.
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

const TS_TEXT = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;

export function createSource({ dbUrl, supabaseUrl = null, secretKey = null }) {
  let sql = null;
  let storage = null;
  const db = () => {
    if (!sql) sql = postgres(dbUrl, { max: 2, onnotice: () => {}, connection: { application_name: 'ezd-backup' } });
    return sql;
  };
  const sinceParam = (since) => (since instanceof Date ? since.toISOString() : since);

  return {
    /** Objects with `updated_at > since` (all when null), keyset by (updated_at, id), never OFFSET. */
    async *listChangedObjects({ since = null, buckets = null, pageSize = 500 }) {
      const s = db();
      const sinceText = since === null ? null : sinceParam(since);
      let after = null;
      for (;;) {
        const rows = await s`
          select id, bucket_id, name, updated_at,
                 to_char(updated_at at time zone 'UTC', ${s.unsafe(TS_TEXT)}) as updated_text,
                 coalesce((metadata->>'size')::bigint, 0) as size,
                 metadata->>'eTag' as etag, metadata->>'mimetype' as mimetype
          from storage.objects
          where (${sinceText}::text::timestamptz is null or updated_at > ${sinceText}::text::timestamptz)
            and (${buckets}::text[] is null or bucket_id = any(${buckets}::text[]))
            and (${after?.ts ?? null}::text::timestamptz is null
                 or (updated_at, id) > (${after?.ts ?? null}::text::timestamptz, ${after?.id ?? null}::uuid))
          order by updated_at, id
          limit ${pageSize}`;
        for (const r of rows) {
          yield {
            bucket: r.bucket_id,
            name: r.name,
            updatedAt: new Date(r.updated_at),
            updatedAtText: r.updated_text,
            size: Number(r.size),
            eTag: r.etag ?? '',
            mimetype: r.mimetype ?? null,
          };
        }
        if (rows.length < pageSize) return;
        const last = rows.at(-1);
        after = { ts: last.updated_text, id: last.id };
      }
    },

    /** Every current (bucket, name) in scope, keyset by (bucket_id, name). */
    async *listAllObjectKeys({ buckets = null, pageSize = 500 }) {
      const s = db();
      let after = null;
      for (;;) {
        const rows = await s`
          select bucket_id, name from storage.objects
          where (${buckets}::text[] is null or bucket_id = any(${buckets}::text[]))
            and (${after?.bucket ?? null}::text is null
                 or (bucket_id, name) > (${after?.bucket ?? null}::text, ${after?.name ?? null}::text))
          order by bucket_id, name
          limit ${pageSize}`;
        for (const r of rows) yield { bucket: r.bucket_id, name: r.name };
        if (rows.length < pageSize) return;
        const last = rows.at(-1);
        after = { bucket: last.bucket_id, name: last.name };
      }
    },

    async download(bucket, name, toPath) {
      if (!storage) {
        storage = createClient(supabaseUrl, secretKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        }).storage;
      }
      const { data, error } = await storage.from(bucket).download(name);
      if (error || !data) throw new Error('download failed');
      writeFileSync(toPath, Buffer.from(await data.arrayBuffer()));
    },

    async newestMigration() {
      const [r] = await db()`select max(version)::text as v from supabase_migrations.schema_migrations`;
      return r?.v ?? null;
    },

    async startRun(kind, scope) {
      const [r] = await db()`insert into public.backup_run (kind, scope) values (${kind}, ${scope}) returning id`;
      return r.id;
    },

    /** Sets the given `backup_run` columns and `finished_at = now()`. */
    async finishRun(id, fields) {
      const s = db();
      const { files_cursor: cursor, ...rest } = fields;
      // A timestamptz parameter goes through a JavaScript Date (milliseconds), so the cursor is sent as text.
      const cursorText = cursor instanceof Date ? cursor.toISOString() : (cursor ?? null);
      await s`update public.backup_run
              set ${s(rest)}, files_cursor = coalesce(${cursorText}::text::timestamptz, files_cursor),
                  finished_at = now()
              where id = ${id}`;
    },

    /** One finished row in one statement (a refused preflight, a restore drill). */
    async insertRun(row) {
      const s = db();
      const [r] = await s`insert into public.backup_run ${s(row)} returning id`;
      return r.id;
    },

    async lastSucceeded(kind, scope) {
      const [r] = await db()`
        select files_cursor,
               to_char(files_cursor at time zone 'UTC', ${db().unsafe(TS_TEXT)}) as files_cursor_text,
               location
        from public.backup_run
        where kind = ${kind} and scope = ${scope} and status = 'succeeded'
        order by started_at desc
        limit 1`;
      if (!r) return null;
      return {
        files_cursor: r.files_cursor ? new Date(r.files_cursor) : null,
        files_cursor_text: r.files_cursor_text ?? null,
        location: r.location ?? null,
      };
    },

    async close() {
      const s = sql;
      sql = null;
      if (s) await s.end({ timeout: 5 });
    },
  };
}
