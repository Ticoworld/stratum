import { createHash } from "crypto";
import { gzipSync } from "zlib";

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function gzipJson(payload: unknown): Buffer {
  const json = JSON.stringify(payload);
  return gzipSync(Buffer.from(json, "utf8"));
}
