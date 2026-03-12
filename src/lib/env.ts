import { z } from "zod";

const optionalNonEmptyString = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  },
  z.string().min(1).optional()
);

const phase1EnvSchema = z.object({
  DATABASE_URL: z.url(),
  AUTH_SECRET: z.string().min(1),
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return value;
      }

      const trimmed = value.trim();
      return trimmed === "" ? undefined : trimmed;
    },
    z.url().default("https://stratum.example.com")
  ),
  AWS_REGION: optionalNonEmptyString,
  AWS_ACCESS_KEY_ID: optionalNonEmptyString,
  AWS_SECRET_ACCESS_KEY: optionalNonEmptyString,
  STRATUM_S3_BUCKET: optionalNonEmptyString,
});

const parsedPhase1Env = phase1EnvSchema.safeParse(process.env);

if (!parsedPhase1Env.success) {
  throw new Error(
    `Invalid Phase 1 environment configuration: ${parsedPhase1Env.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ")}`
  );
}

export const phase1Env = parsedPhase1Env.data;

export type OptionalS3Config = {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export function getOptionalS3Config(): OptionalS3Config | null {
  const region = phase1Env.AWS_REGION;
  const accessKeyId = phase1Env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = phase1Env.AWS_SECRET_ACCESS_KEY;
  const bucket = phase1Env.STRATUM_S3_BUCKET;

  const values = [region, accessKeyId, secretAccessKey, bucket];

  if (values.every((value) => !value)) {
    return null;
  }

  if (values.some((value) => !value)) {
    throw new Error(
      "Partial S3 configuration detected. Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and STRATUM_S3_BUCKET together or leave all unset."
    );
  }

  return {
    region: region as string,
    accessKeyId: accessKeyId as string,
    secretAccessKey: secretAccessKey as string,
    bucket: bucket as string,
  };
}
