// EZD-025 Step 4 (vault/plans/EZD-025.md; Interface contract): the off-site bucket (Backblaze B2 through its
// S3-compatible API, Q-0074 (a)) over `@aws-sdk/client-s3`. Client settings as scripts/release/offsite-upload.mjs.
// No method deletes a stored version: `hide` adds a delete marker (no VersionId), and only the provider's
// lifecycle rules remove versions (Q-0075). SDK errors come back as the operation, the key and the status only.
import { createHash } from 'node:crypto';
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  GetObjectLockConfigurationCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const SDK = {
  S3Client,
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  GetObjectLockConfigurationCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
};

const md5Base64 = (body) => createHash('md5').update(body).digest('base64');
const statusOf = (err) => err?.$metadata?.httpStatusCode;
const isNotFound = (err) =>
  statusOf(err) === 404 || ['NotFound', 'NoSuchKey', 'ObjectLockConfigurationNotFoundError'].includes(err?.name);

/** `s3 = { endpoint, region, bucket, accessKeyId, secretAccessKey }`. */
export function createS3Store(s3, sdk = SDK) {
  const { endpoint, region, bucket, accessKeyId, secretAccessKey } = s3;
  const client = new sdk.S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  const send = async (operation, key, command) => {
    try {
      return await client.send(command);
    } catch (err) {
      throw Object.assign(new Error(`${operation} failed: ${key} (${statusOf(err) ?? 'network'})`), {
        notFound: isNotFound(err),
      });
    }
  };

  return Object.freeze({
    /** 'Enabled', 'Suspended' or null (never set). */
    async versioningStatus() {
      const r = await send('GetBucketVersioning', '', new sdk.GetBucketVersioningCommand({ Bucket: bucket }));
      return r?.Status ?? null;
    },

    /** `{ enabled, mode, days }` of the bucket's default retention; not configured is `enabled: false`. */
    async objectLockStatus() {
      let r;
      try {
        r = await send('GetObjectLockConfiguration', '', new sdk.GetObjectLockConfigurationCommand({ Bucket: bucket }));
      } catch (err) {
        if (err.notFound) return { enabled: false, mode: null, days: null };
        throw err;
      }
      const cfg = r?.ObjectLockConfiguration;
      const retention = cfg?.Rule?.DefaultRetention;
      return {
        enabled: cfg?.ObjectLockEnabled === 'Enabled',
        mode: retention?.Mode ?? null,
        days: typeof retention?.Days === 'number' ? retention.Days : null,
      };
    },

    /** `{ size, meta }` of the current version, or null when the key has none. */
    async head(key) {
      try {
        const r = await send('HeadObject', key, new sdk.HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { size: Number(r.ContentLength ?? 0), meta: { ...(r.Metadata ?? {}) } };
      } catch (err) {
        if (err.notFound) return null;
        throw err;
      }
    },

    async putFile(key, filePath, { contentType, meta = {} }) {
      const body = readFileSync(filePath);
      await send(
        'PutObject',
        key,
        new sdk.PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType ?? 'application/octet-stream',
          ContentMD5: md5Base64(body),
          Metadata: meta,
        }),
      );
    },

    /** Writes the current version (or `versionId`) to `filePath`; resolves `{ contentType }`. */
    async getToFile(key, filePath, { versionId } = {}) {
      const input = { Bucket: bucket, Key: key };
      if (versionId) input.VersionId = versionId;
      const r = await send('GetObject', key, new sdk.GetObjectCommand(input));
      mkdirSync(path.dirname(filePath), { recursive: true });
      try {
        await pipeline(r.Body, createWriteStream(filePath));
      } catch {
        throw new Error(`GetObject failed: ${key} (network)`);
      }
      return { contentType: r.ContentType ?? null };
    },

    /** Current keys under `prefix`, paged. */
    async list(prefix) {
      const keys = [];
      let token;
      do {
        const r = await send(
          'ListObjectsV2',
          prefix,
          new sdk.ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
        );
        for (const c of r.Contents ?? []) keys.push(c.Key);
        token = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (token);
      return keys;
    },

    /** Every version and delete marker under `prefix`, paged, as `Entry` objects. */
    async listVersions(prefix) {
      const out = [];
      let keyMarker;
      let versionMarker;
      let more = true;
      while (more) {
        const r = await send(
          'ListObjectVersions',
          prefix,
          new sdk.ListObjectVersionsCommand({
            Bucket: bucket,
            Prefix: prefix,
            KeyMarker: keyMarker,
            VersionIdMarker: versionMarker,
          }),
        );
        for (const v of r.Versions ?? []) {
          out.push({
            key: v.Key,
            versionId: v.VersionId,
            isDeleteMarker: false,
            lastModified: new Date(v.LastModified).toISOString(),
            size: typeof v.Size === 'number' ? v.Size : null,
          });
        }
        for (const m of r.DeleteMarkers ?? []) {
          out.push({
            key: m.Key,
            versionId: m.VersionId,
            isDeleteMarker: true,
            lastModified: new Date(m.LastModified).toISOString(),
            size: null,
          });
        }
        more = r.IsTruncated === true;
        keyMarker = r.NextKeyMarker;
        versionMarker = r.NextVersionIdMarker;
      }
      return out;
    },

    /** Adds a delete marker (Backblaze: hides the file). Sent without a version id, so no bytes are removed. */
    async hide(key) {
      await send('DeleteObject', key, new sdk.DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  });
}
