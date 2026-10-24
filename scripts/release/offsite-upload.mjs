// EZD-023d Step 3 (vault/plans/EZD-023d.md): the write-only off-site uploader over `@aws-sdk/client-s3`.
// Two methods and no read, list or delete (Q-0112: the release key is limited to releases/, write only).
// Tests pass a fake `sdk`; the real SDK is imported only here.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const md5Base64 = (body) => createHash('md5').update(body).digest('base64');

/** `cfg = { endpoint, region, bucket, accessKeyId, secretAccessKey }` → frozen `{ putFile, putJson }`. */
export function createOffsiteUploader(cfg, sdk = { S3Client, PutObjectCommand }) {
  const { endpoint, region, bucket, accessKeyId, secretAccessKey } = cfg;
  const client = new sdk.S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  // The SDK's message can name the endpoint or the key id; only the key and the status come back.
  const put = async (key, body, contentType) => {
    const command = new sdk.PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentMD5: md5Base64(body),
    });
    try {
      await client.send(command);
    } catch (err) {
      const status = err?.$metadata?.httpStatusCode;
      throw new Error(`offsite put failed: ${key} (${status ?? 'network'})`);
    }
  };

  return Object.freeze({
    putFile: (key, filePath, { contentType }) => put(key, readFileSync(filePath), contentType),
    putJson: (key, value) => put(key, `${JSON.stringify(value, null, 2)}\n`, 'application/json'),
  });
}
