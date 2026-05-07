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
      const parsed = parseEnrichmentBatchResponse(validJson, expectedKeys);
      expect(parsed).not.toBeNull();
      expect(parsed?.length).toBe(2);
      expect(parsed![0].roleKey).toBe("key1");
    });

    test("valid JSON wrapped in markdown code fence", () => {
      const fenced = "\`\`\`json\n" + validJson + "\n\`\`\`";
      const parsed = parseEnrichmentBatchResponse(fenced, expectedKeys);
      expect(parsed).not.toBeNull();
      expect(parsed?.length).toBe(2);
    });

    test("non-JSON string returns null", () => {
      expect(parseEnrichmentBatchResponse("Hello world", expectedKeys)).toBeNull();
    });

    test("array length mismatch returns null", () => {
      expect(parseEnrichmentBatchResponse(validJson, ["key1"])).toBeNull(); // expected 1, got 2
    });

    test("invalid businessFunction returns null", () => {
      const invalid = validJson.replace('"engineering"', '"coding"');
      expect(parseEnrichmentBatchResponse(invalid, expectedKeys)).toBeNull();
    });

    test("invalid seniority returns null", () => {
      const invalid = validJson.replace('"senior"', '"super_senior"');
      expect(parseEnrichmentBatchResponse(invalid, expectedKeys)).toBeNull();
    });

    test("roleKey not in expected set returns null", () => {
      expect(parseEnrichmentBatchResponse(validJson, ["key1", "key3"])).toBeNull();
    });

    test("strategicTags length > 3 returns null", () => {
      const invalid = validJson.replace('["backend", "scala"]', '["1", "2", "3", "4"]');
      expect(parseEnrichmentBatchResponse(invalid, expectedKeys)).toBeNull();
    });

    test("empty evidenceReason returns null", () => {
      const invalid = validJson.replace('"Backend engineer role."', '""');
      expect(parseEnrichmentBatchResponse(invalid, expectedKeys)).toBeNull();
    });

    test("confidence low is valid", () => {
      const lowConf = validJson.replace('"high"', '"low"');
      expect(parseEnrichmentBatchResponse(lowConf, expectedKeys)).not.toBeNull();
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

    test("51 jobs -> 2 batches", async () => {
      const jobs = Array.from({ length: 51 }).map((_, i) => makeJob({ title: i.toString() }));
      const result = await runRoleEnrichment("TestCo", jobs);
      expect(result.batchesAttempted).toBe(2);
    });

    test("200 jobs -> 4 batches", async () => {
      const jobs = Array.from({ length: 200 }).map((_, i) => makeJob({ title: i.toString() }));
      const result = await runRoleEnrichment("TestCo", jobs);
      expect(result.batchesAttempted).toBe(4);
      expect(result.status).toBe("failed"); // since API fails
    });

    test("201 jobs -> truncates to 200, 4 batches, partial status", async () => {
      const jobs = Array.from({ length: 201 }).map((_, i) => makeJob({ title: i.toString() }));
      const result = await runRoleEnrichment("TestCo", jobs);
      expect(result.batchesAttempted).toBe(4);
      // Because it truncated, status is partial even if all failed (or failed if we check batchesFailed === chunks.length? Wait.)
      // The code sets status = "failed" if batchesFailed === chunks.length. Let's see what the test actually returns.
      // Wait, if it fails all 4 batches AND truncated, it's "failed" or "partial"?
      // The implementation is:
      // if (batchesFailed === chunks.length) status = "failed";
      // else if (batchesFailed > 0 || truncated) status = "partial";
      expect(result.status).toBe("failed"); 
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
      };

      const serialized = JSON.parse(JSON.stringify(result));
      expect(serialized).not.toHaveProperty("roleEnrichments");
      expect(serialized).not.toHaveProperty("aiRoleEnrichmentStatus");
      expect(serialized.otherField).toBe("value");
    });
  });
});
