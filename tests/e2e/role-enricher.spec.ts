import { test, expect } from "@playwright/test";
import {
  buildEnrichmentRoleKey,
} from "../../src/lib/signals/roleEnrichment";
import {
  parseEnrichmentBatchResponse,
  runRoleEnrichment,
} from "../../src/lib/ai/roleEnricher";
import type { Job } from "../../src/lib/api/boards";

function makeJob(overrides: Partial<Job>): Job {
  return {
    title: "Software Engineer",
    department: null,
    location: null,
    source: "GREENHOUSE",
    roleId: null,
    roleIdType: null,
    requisitionId: null,
    jobUrl: null,
    applyUrl: null,
    sourceTimestamp: null,
    sourceTimestampType: null,
    observedAt: new Date().toISOString(),
    ...overrides,
  };
}

test.describe("AI-1B: Role Enrichment", () => {
  test.describe("Group 1: buildEnrichmentRoleKey", () => {
    test("job with roleId", () => {
      const job = makeJob({ roleId: "123", source: "LEVER" });
      expect(buildEnrichmentRoleKey(job)).toBe("id::LEVER::123");
    });

    test("job with jobUrl", () => {
      const job = makeJob({ jobUrl: "https://example.com/job/456" });
      expect(buildEnrichmentRoleKey(job)).toBe("url::https://example.com/job/456");
    });

    test("job with requisitionId", () => {
      const job = makeJob({ requisitionId: "REQ-789", source: "ASHBY" });
      expect(buildEnrichmentRoleKey(job)).toBe("req::ASHBY::REQ-789");
    });

    test("job with text fallback", () => {
      const job = makeJob({
        title: " Sr. Eng ",
        department: " Product Development ",
        location: " Remote US ",
        source: "GREENHOUSE",
      });
      // "Sr. Eng" -> "senior engineering"
      // "Remote US" -> "remote"
      expect(buildEnrichmentRoleKey(job)).toBe("text::senior engineering::product development::remote::greenhouse");
    });

    test("same title, different location = distinct keys", () => {
      const job1 = makeJob({ title: "Engineer", location: "NY" });
      const job2 = makeJob({ title: "Engineer", location: "SF" });
      expect(buildEnrichmentRoleKey(job1)).not.toBe(buildEnrichmentRoleKey(job2));
    });

    test("identical text jobs = same key", () => {
      const job1 = makeJob({ title: "Engineer", location: "NY" });
      const job2 = makeJob({ title: "Engineer", location: "NY" });
      expect(buildEnrichmentRoleKey(job1)).toBe(buildEnrichmentRoleKey(job2));
    });
  });

  test.describe("Group 2: parseEnrichmentBatchResponse", () => {
    const expectedKeys = ["key1", "key2"];
    const validJson = `
    [
      {
        "roleKey": "key1",
        "businessFunction": "engineering",
        "businessTheme": "core_platform",
        "seniority": "senior",
        "strategicTags": ["backend", "scala"],
        "evidenceReason": "Backend engineer role.",
        "confidence": "high"
      },
      {
        "roleKey": "key2",
        "businessFunction": "product",
        "businessTheme": "product_execution",
        "seniority": "mid",
        "strategicTags": ["growth"],
        "evidenceReason": "Product manager role.",
        "confidence": "medium"
      }
    ]
    `;

    test("valid JSON array returns AiRoleEnrichment[]", () => {
      const result = parseEnrichmentBatchResponse(validJson, expectedKeys);
      expect(result.parseFailure).toBe(false);
      expect(result.validEnrichments.length).toBe(2);
      expect(result.validEnrichments[0].roleKey).toBe("key1");
    });

    test("valid JSON wrapped in markdown code fence", () => {
      const fenced = "```json\n" + validJson + "\n```";
      const result = parseEnrichmentBatchResponse(fenced, expectedKeys);
      expect(result.parseFailure).toBe(false);
      expect(result.validEnrichments.length).toBe(2);
    });

    test("non-JSON string returns parseFailure=true", () => {
      const result = parseEnrichmentBatchResponse("Hello world", expectedKeys);
      expect(result.parseFailure).toBe(true);
    });

    test("array length mismatch is tolerated (partial success)", () => {
      const result = parseEnrichmentBatchResponse(validJson, ["key1"]);
      // validJson has key1 and key2. key1 is in expected, key2 is not.
      // So key1 is accepted, key2 is rejected.
      expect(result.validEnrichments.length).toBe(1);
      expect(result.rejectedCount).toBe(1);
    });

    test("invalid businessFunction is rejected as row failure", () => {
      const invalid = validJson.replace('"engineering"', '"coding"');
      const result = parseEnrichmentBatchResponse(invalid, expectedKeys);
      expect(result.validEnrichments.length).toBe(1); // key2 is still valid
      expect(result.rejectedCount).toBe(1);
    });

    test("invalid seniority is rejected as row failure", () => {
      const invalid = validJson.replace('"senior"', '"super_senior"');
      const result = parseEnrichmentBatchResponse(invalid, expectedKeys);
      expect(result.validEnrichments.length).toBe(1);
      expect(result.rejectedCount).toBe(1);
    });

    test("roleKey not in expected set is rejected as row failure", () => {
      const result = parseEnrichmentBatchResponse(validJson, ["key1", "key3"]);
      expect(result.validEnrichments.length).toBe(1); // key1 matches
      expect(result.rejectedCount).toBe(1); // key2 does not match key1 or key3
    });

    test("strategicTags length > 3 is rejected", () => {
      const invalid = validJson.replace('["backend", "scala"]', '["1", "2", "3", "4"]');
      const result = parseEnrichmentBatchResponse(invalid, expectedKeys);
      expect(result.validEnrichments.length).toBe(1);
      expect(result.rejectedCount).toBe(1);
    });

    test("empty evidenceReason is rejected", () => {
      const invalid = validJson.replace('"Backend engineer role."', '""');
      const result = parseEnrichmentBatchResponse(invalid, expectedKeys);
      expect(result.validEnrichments.length).toBe(1);
      expect(result.rejectedCount).toBe(1);
    });

    test("confidence low is valid", () => {
      const lowConf = validJson.replace('"high"', '"low"');
      const result = parseEnrichmentBatchResponse(lowConf, expectedKeys);
      expect(result.validEnrichments.length).toBe(2);
    });
  });

  test.describe("Group 3: runRoleEnrichment - disabled mode", () => {
    test("STRATUM_ENABLE_ROLE_ENRICHMENT not set -> status disabled", async () => {
      const original = process.env.STRATUM_ENABLE_ROLE_ENRICHMENT;
      delete process.env.STRATUM_ENABLE_ROLE_ENRICHMENT;

      const result = await runRoleEnrichment("TestCo", [makeJob({})]);
      expect(result.status).toBe("disabled");
      expect(result.enrichedCount).toBe(0);

      process.env.STRATUM_ENABLE_ROLE_ENRICHMENT = original;
    });

    test("STRATUM_E2E_DISABLE_GEMINI=1 -> status disabled", async () => {
      const originalEnv = process.env.STRATUM_ENABLE_ROLE_ENRICHMENT;
      const originalE2e = process.env.STRATUM_E2E_DISABLE_GEMINI;
      
      process.env.STRATUM_ENABLE_ROLE_ENRICHMENT = "1";
      process.env.STRATUM_E2E_DISABLE_GEMINI = "1";

      const result = await runRoleEnrichment("TestCo", [makeJob({})]);
      expect(result.status).toBe("disabled");
      
      process.env.STRATUM_ENABLE_ROLE_ENRICHMENT = originalEnv;
      process.env.STRATUM_E2E_DISABLE_GEMINI = originalE2e;
    });
  });

  test.describe("Group 4: runRoleEnrichment - chunking", () => {
    let originalEnv: string | undefined;
    let originalE2e: string | undefined;

    test.beforeAll(() => {
      originalEnv = process.env.STRATUM_ENABLE_ROLE_ENRICHMENT;
      originalE2e = process.env.STRATUM_E2E_DISABLE_GEMINI;
      process.env.STRATUM_ENABLE_ROLE_ENRICHMENT = "1";
      process.env.STRATUM_E2E_DISABLE_GEMINI = "0"; // allow gemini call to proceed
      // Without a valid GEMINI_API_KEY, the API call will fail, which is perfect for testing chunking layout
    });

    test.afterAll(() => {
      process.env.STRATUM_ENABLE_ROLE_ENRICHMENT = originalEnv;
      process.env.STRATUM_E2E_DISABLE_GEMINI = originalE2e;
    });

    test("0 jobs -> disabled", async () => {
      const result = await runRoleEnrichment("TestCo", []);
      expect(result.status).toBe("disabled");
      expect(result.batchesAttempted).toBe(0);
    });

    test("1 job -> 1 batch", async () => {
      const result = await runRoleEnrichment("TestCo", [makeJob({ title: "1" })]);
      // Should fail API call due to no key, but attempt 1 batch
      expect(result.batchesAttempted).toBe(1);
    });

    test("51 jobs -> 3 batches", async () => {
      const jobs = Array.from({ length: 51 }).map((_, i) => makeJob({ title: i.toString() }));
      const result = await runRoleEnrichment("TestCo", jobs);
      expect(result.batchesAttempted).toBe(3); // 25 + 25 + 1
    });

    test("200 jobs -> 8 batches", async () => {
      const jobs = Array.from({ length: 200 }).map((_, i) => makeJob({ title: i.toString() }));
      const result = await runRoleEnrichment("TestCo", jobs);
      expect(result.batchesAttempted).toBe(8); // 200 / 25
      expect(["failed", "complete", "partial"]).toContain(result.status);
    });

    test("201 jobs -> truncates to 200, 8 batches, partial status", async () => {
      const jobs = Array.from({ length: 201 }).map((_, i) => makeJob({ title: i.toString() }));
      const result = await runRoleEnrichment("TestCo", jobs);
      expect(result.batchesAttempted).toBe(8);
      expect(["failed", "partial"]).toContain(result.status);
    });
  });

  test.describe("Group 5: StratumResult serialization", () => {
    test("StratumResult with enrichments serializes cleanly", () => {
      const result = {
        roleEnrichments: {
          "key1": {
            roleKey: "key1",
            title: "Engineer",
            businessFunction: "engineering" as const,
            businessTheme: "core_platform" as const,
            seniority: "senior" as const,
            strategicTags: [],
            evidenceReason: "reason",
            confidence: "high" as const,
          }
        },
        aiRoleEnrichmentStatus: "complete" as const,
      };

      const serialized = JSON.parse(JSON.stringify(result));
      expect(serialized.aiRoleEnrichmentStatus).toBe("complete");
      expect(serialized.roleEnrichments.key1.businessFunction).toBe("engineering");
    });

    test("StratumResult without enrichments (undefined) omits keys", () => {
      const result = {
        otherField: "value",
        roleEnrichments: undefined,
        aiRoleEnrichmentStatus: undefined,
        aiRoleEnrichmentMeta: undefined,
      };

      const serialized = JSON.parse(JSON.stringify(result));
      expect(serialized).not.toHaveProperty("roleEnrichments");
      expect(serialized).not.toHaveProperty("aiRoleEnrichmentStatus");
      expect(serialized).not.toHaveProperty("aiRoleEnrichmentMeta");
      expect(serialized.otherField).toBe("value");
    });
  });

  test.describe("Group 6: Partial Parsing & Normalization (AI-2F)", () => {
    const expectedKeys = ["key1", "key2", "key3"];
    
    test("salvages valid rows from partially malformed batch", () => {
      const mixedJson = `
      [
        {
          "roleKey": "key1",
          "businessFunction": "engineering",
          "businessTheme": "core_platform",
          "seniority": "senior",
          "strategicTags": ["backend"],
          "evidenceReason": "Valid row.",
          "confidence": "high"
        },
        {
          "roleKey": "key2",
          "businessFunction": "invalid_func",
          "businessTheme": "core_platform",
          "seniority": "mid",
          "strategicTags": [],
          "evidenceReason": "Invalid enum.",
          "confidence": "medium"
        },
        {
          "roleKey": "key3",
          "businessFunction": "product",
          "businessTheme": "product_execution",
          "seniority": "mid",
          "strategicTags": [],
          "evidenceReason": "Valid row 2.",
          "confidence": "high"
        }
      ]
      `;
      const result = parseEnrichmentBatchResponse(mixedJson, expectedKeys);
      expect(result.validEnrichments.length).toBe(2);
      expect(result.rejectedCount).toBe(1);
      expect(result.parseFailure).toBe(false);
      expect(result.validEnrichments[0].roleKey).toBe("key1");
      expect(result.validEnrichments[1].roleKey).toBe("key3");
    });

    test("normalizes enum values (trim, case, underscores)", () => {
      const unnormalizedJson = `
      [
        {
          "roleKey": "key1",
          "businessFunction": " Engineering ",
          "businessTheme": "CORE-PLATFORM",
          "seniority": " Senior ",
          "strategicTags": [],
          "evidenceReason": "Needs normalization.",
          "confidence": "high"
        }
      ]
      `;
      const result = parseEnrichmentBatchResponse(unnormalizedJson, ["key1"]);
      expect(result.validEnrichments.length).toBe(1);
      expect(result.validEnrichments[0].businessFunction).toBe("engineering");
      expect(result.validEnrichments[0].businessTheme).toBe("core_platform");
      expect(result.validEnrichments[0].seniority).toBe("senior");
    });

    test("rejects hallucinated roleKeys", () => {
      const hallucinatedJson = `
      [
        {
          "roleKey": "key_unknown",
          "businessFunction": "engineering",
          "businessTheme": "core_platform",
          "seniority": "senior",
          "strategicTags": [],
          "evidenceReason": "Unknown key.",
          "confidence": "high"
        }
      ]
      `;
      const result = parseEnrichmentBatchResponse(hallucinatedJson, ["key1"]);
      expect(result.validEnrichments.length).toBe(0);
      expect(result.rejectedCount).toBe(1);
    });
  });
});
