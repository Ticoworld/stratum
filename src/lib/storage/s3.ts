import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  if (!s3Bucket) {
    throw new Error("S3 is not configured for this environment.");
  }

  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket: s3Bucket,
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
