import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getOptionalS3Config } from "@/lib/env";

const s3Config = getOptionalS3Config();
let s3Client: S3Client | null = null;

export const s3Bucket = s3Config?.bucket ?? null;

export function isS3Configured(): boolean {
  return s3Config !== null;
}

export function getS3Client(): S3Client {
  if (!s3Config) {
    throw new Error("S3 is not configured for this environment.");
  }

  if (!s3Client) {
    s3Client = new S3Client({
      region: s3Config.region,
      endpoint: s3Config.endpoint,
      credentials: {
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
      },
    });
  }

  return s3Client;
}

export function closeS3Client() {
  if (!s3Client) {
    return;
  }

  s3Client.destroy();
  s3Client = null;
}

export async function putObject(params: {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
  contentEncoding?: string;
}): Promise<void> {
  if (!s3Bucket) {
    throw new Error("S3 is not configured for this environment.");
  }

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: s3Bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      ContentEncoding: params.contentEncoding,
    })
  );
}
