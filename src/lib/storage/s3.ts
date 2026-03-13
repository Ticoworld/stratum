import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getObjectStorageEnv, getObjectStorageEnvStatus } from "@/lib/env";

let s3Client: S3Client | null = null;

export function isS3Configured(): boolean {
  return getObjectStorageEnvStatus().ok;
}

export function getS3Bucket(): string {
  return getObjectStorageEnv().STRATUM_S3_BUCKET;
}

export function getS3Client(): S3Client {
  const s3Config = getObjectStorageEnv();

  if (!s3Client) {
    s3Client = new S3Client({
      region: s3Config.AWS_REGION,
      endpoint: s3Config.endpoint,
      credentials: {
        accessKeyId: s3Config.AWS_ACCESS_KEY_ID,
        secretAccessKey: s3Config.AWS_SECRET_ACCESS_KEY,
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
  const bucket = getS3Bucket();

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      ContentEncoding: params.contentEncoding,
    })
  );
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const bucket = getS3Bucket();

  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  if (!response.Body) {
    throw new Error(`S3 object "${key}" returned an empty body.`);
  }

  return streamToBuffer(response.Body as NodeJS.ReadableStream);
}

export async function getObjectText(key: string): Promise<string> {
  const buffer = await getObjectBuffer(key);
  return buffer.toString("utf8");
}

export async function getObjectJson<T>(key: string): Promise<T> {
  const text = await getObjectText(key);
  return JSON.parse(text) as T;
}
