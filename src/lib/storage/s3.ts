import { S3Client } from "@aws-sdk/client-s3";
import { getOptionalS3Config } from "@/lib/env";

const s3Config = getOptionalS3Config();

export const s3Bucket = s3Config?.bucket ?? null;

export function isS3Configured(): boolean {
  return s3Config !== null;
}

export function getS3Client(): S3Client {
  if (!s3Config) {
    throw new Error("S3 is not configured for this environment.");
  }

  return new S3Client({
    region: s3Config.region,
    credentials: {
      accessKeyId: s3Config.accessKeyId,
      secretAccessKey: s3Config.secretAccessKey,
    },
  });
}
