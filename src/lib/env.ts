import { z } from "zod";

const nonEmptyString = z
  .string()
  .trim()
  .min(1, "Must be set.");

const optionalNonEmptyString = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  },
  nonEmptyString.optional()
);

const optionalPositiveIntegerString = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  },
  z
    .string()
    .regex(/^\d+$/, "Must be a positive integer.")
    .optional()
);

const sharedRuntimeEnvSchema = z.object({
  DATABASE_URL: nonEmptyString,
});

const sharedRequiredEnvSchema = z.object({
  DATABASE_URL: nonEmptyString,
  AWS_REGION: nonEmptyString,
  AWS_ACCESS_KEY_ID: nonEmptyString,
  AWS_SECRET_ACCESS_KEY: nonEmptyString,
  STRATUM_S3_BUCKET: nonEmptyString,
});

const webRequiredEnvSchema = z.object({
  AUTH_SECRET: nonEmptyString,
  AUTH_GOOGLE_ID: nonEmptyString,
  AUTH_GOOGLE_SECRET: nonEmptyString,
  NEXT_PUBLIC_SITE_URL: z.url("NEXT_PUBLIC_SITE_URL must be a valid URL."),
});

const workerRequiredEnvSchema = z.object({
  GEMINI_API_KEY: nonEmptyString,
});

const optionalLocalEnvSchema = z.object({
  STRATUM_S3_ENDPOINT: optionalNonEmptyString,
  R2_ENDPOINT: optionalNonEmptyString,
  STRATUM_ANALYSIS_RETRY_PROOF_FAILURES: optionalPositiveIntegerString,
});

const objectStorageEnvSchema = z.object({
  AWS_REGION: nonEmptyString,
  AWS_ACCESS_KEY_ID: nonEmptyString,
  AWS_SECRET_ACCESS_KEY: nonEmptyString,
  STRATUM_S3_BUCKET: nonEmptyString,
});

const analysisEnvSchema = z.object({
  GEMINI_API_KEY: nonEmptyString,
});

type SharedRuntimeEnv = z.infer<typeof sharedRuntimeEnvSchema>;
type WebRequiredEnv = z.infer<typeof webRequiredEnvSchema>;
type WorkerRequiredEnv = z.infer<typeof workerRequiredEnvSchema>;
type OptionalLocalEnv = z.infer<typeof optionalLocalEnvSchema>;
type ObjectStorageEnv = z.infer<typeof objectStorageEnvSchema> & {
  endpoint?: string;
};
type AnalysisEnv = z.infer<typeof analysisEnvSchema>;
type SharedEnv = SharedRuntimeEnv &
  OptionalLocalEnv & {
    AWS_REGION?: string;
    AWS_ACCESS_KEY_ID?: string;
    AWS_SECRET_ACCESS_KEY?: string;
    STRATUM_S3_BUCKET?: string;
  };
type WebEnv = SharedEnv & WebRequiredEnv;
type WorkerEnv = SharedEnv & WorkerRequiredEnv;

export type EnvironmentRole = "web runtime" | "worker runtime";
export type EnvContractGroup =
  | "shared required"
  | "web-only required"
  | "worker-only required"
  | "optional/local-only";

export const ENV_CONTRACT = {
  sharedRequired: ["DATABASE_URL", "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "STRATUM_S3_BUCKET"],
  webOnlyRequired: ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "NEXT_PUBLIC_SITE_URL"],
  workerOnlyRequired: ["GEMINI_API_KEY"],
  optionalLocalOnly: ["STRATUM_S3_ENDPOINT", "R2_ENDPOINT", "STRATUM_ANALYSIS_RETRY_PROOF_FAILURES"],
} as const satisfies Record<string, readonly string[]>;

type EnvStatus = {
  ok: boolean;
  missing: string[];
  invalid: string[];
};

let sharedEnvCache: SharedEnv | null = null;
let webEnvCache: WebEnv | null = null;
let workerEnvCache: WorkerEnv | null = null;
let objectStorageEnvCache: ObjectStorageEnv | null = null;
let analysisEnvCache: AnalysisEnv | null = null;

function formatSchemaIssues(issues: z.ZodIssue[]) {
  return issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

function buildEnvStatus(schema: z.ZodTypeAny): EnvStatus {
  const parsed = schema.safeParse(process.env);

  if (parsed.success) {
    return {
      ok: true,
      missing: [],
      invalid: [],
    };
  }

  const missing = new Set<string>();
  const invalid = new Set<string>();

  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".");

    if (!key) {
      continue;
    }

    if (issue.message === "Must be set.") {
      missing.add(key);
      continue;
    }

    invalid.add(`${key}: ${issue.message}`);
  }

  return {
    ok: missing.size === 0 && invalid.size === 0,
    missing: [...missing],
    invalid: [...invalid],
  };
}

function parseEnvGroup<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  label: string
): z.infer<TSchema> {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(
      `Invalid ${label} environment configuration.\n${formatSchemaIssues(parsed.error.issues).join("\n")}`
    );
  }

  return parsed.data;
}

function getOptionalLocalEnv(): OptionalLocalEnv {
  return optionalLocalEnvSchema.parse(process.env);
}

export function getSharedEnv() {
  if (sharedEnvCache) {
    return sharedEnvCache;
  }

  const nextEnv: SharedEnv = {
    ...parseEnvGroup(sharedRuntimeEnvSchema, "shared required"),
    ...getOptionalLocalEnv(),
    AWS_REGION: process.env.AWS_REGION?.trim() || undefined,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID?.trim() || undefined,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY?.trim() || undefined,
    STRATUM_S3_BUCKET: process.env.STRATUM_S3_BUCKET?.trim() || undefined,
  };

  sharedEnvCache = nextEnv;
  return sharedEnvCache;
}

export function getWebEnv() {
  if (webEnvCache) {
    return webEnvCache;
  }

  const nextEnv: WebEnv = {
    ...getSharedEnv(),
    ...parseEnvGroup(webRequiredEnvSchema, "web runtime"),
  };

  webEnvCache = nextEnv;
  return webEnvCache;
}

export function getWorkerEnv() {
  if (workerEnvCache) {
    return workerEnvCache;
  }

  const nextEnv: WorkerEnv = {
    ...getSharedEnv(),
    ...parseEnvGroup(workerRequiredEnvSchema, "worker runtime"),
  };

  workerEnvCache = nextEnv;
  return workerEnvCache;
}

export function getObjectStorageEnv(): ObjectStorageEnv {
  if (objectStorageEnvCache) {
    return objectStorageEnvCache;
  }

  const parsed = objectStorageEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(
      `Object storage is not configured.\n${formatSchemaIssues(parsed.error.issues).join("\n")}\nSet AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and STRATUM_S3_BUCKET.`
    );
  }

  objectStorageEnvCache = {
    ...parsed.data,
    endpoint: process.env.STRATUM_S3_ENDPOINT?.trim() || process.env.R2_ENDPOINT?.trim() || undefined,
  };

  return objectStorageEnvCache;
}

export function getAnalysisEnv(): AnalysisEnv {
  if (analysisEnvCache) {
    return analysisEnvCache;
  }

  const parsed = analysisEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(
      `Structured analysis is not configured.\n${formatSchemaIssues(parsed.error.issues).join("\n")}\nSet GEMINI_API_KEY on the worker runtime before processing report runs.`
    );
  }

  analysisEnvCache = parsed.data;
  return analysisEnvCache;
}

export function getEnvContractStatus(group: EnvContractGroup): EnvStatus {
  if (group === "shared required") {
    return buildEnvStatus(sharedRequiredEnvSchema);
  }

  if (group === "web-only required") {
    return buildEnvStatus(webRequiredEnvSchema);
  }

  if (group === "worker-only required") {
    return buildEnvStatus(workerRequiredEnvSchema);
  }

  return buildEnvStatus(optionalLocalEnvSchema);
}

export function getDatabaseEnvStatus(): EnvStatus {
  return buildEnvStatus(sharedRuntimeEnvSchema);
}

export function getObjectStorageEnvStatus(): EnvStatus {
  return buildEnvStatus(objectStorageEnvSchema);
}

export function getAnalysisEnvStatus(): EnvStatus {
  return buildEnvStatus(analysisEnvSchema);
}

export function validateRuntimeEnv(role: EnvironmentRole) {
  if (role === "web runtime") {
    return getWebEnv();
  }

  return {
    ...getWorkerEnv(),
    ...getObjectStorageEnv(),
    ...getAnalysisEnv(),
  };
}
