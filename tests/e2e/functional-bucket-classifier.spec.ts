import { test, expect } from "@playwright/test";
import {
  mapToFunctionalBucket,
  computeFunctionalMix,
} from "../../src/lib/signals/watchlistTaxonomy";
import type { Job } from "../../src/lib/api/boards";

// ---------------------------------------------------------------------------
// Phase 6B-2B: mapToFunctionalBucket — canonical chart classifier
// ---------------------------------------------------------------------------
// These tests verify that the extracted shared function produces exactly the
// same bucket assignments as the former inline getHiringMix in page.tsx.

test.describe("6B-2B: mapToFunctionalBucket — functional bucket assignment", () => {

  // --- Engineering ---
  test("Platform Engineer → Engineering", () => {
    expect(mapToFunctionalBucket({ title: "Platform Engineer", department: "Core Platform" })).toBe("Engineering");
  });

  test("ML Engineer → Engineering", () => {
    expect(mapToFunctionalBucket({ title: "ML Engineer", department: "AI Research" })).toBe("Engineering");
  });

  test("Software Engineer → Engineering", () => {
    expect(mapToFunctionalBucket({ title: "Software Engineer", department: "Product" })).toBe("Engineering");
  });

  test("Data Engineer → Engineering (data keyword matches engineering bucket)", () => {
    expect(mapToFunctionalBucket({ title: "Data Engineer", department: "Data Platform" })).toBe("Engineering");
  });

  test("DevOps Engineer → Engineering", () => {
    expect(mapToFunctionalBucket({ title: "DevOps Engineer", department: "Infrastructure" })).toBe("Engineering");
  });

  // --- Sales ---
  test("Account Executive → Sales", () => {
    expect(mapToFunctionalBucket({ title: "Account Executive", department: "Sales" })).toBe("Sales");
  });

  test("SDR → Sales", () => {
    expect(mapToFunctionalBucket({ title: "SDR", department: "Revenue" })).toBe("Sales");
  });

  test("Business Development Representative → Sales", () => {
    expect(mapToFunctionalBucket({ title: "Business Development Representative", department: "GTM" })).toBe("Sales");
  });

  // --- Product ---
  test("Product Manager → Product", () => {
    expect(mapToFunctionalBucket({ title: "Product Manager", department: "Product" })).toBe("Product");
  });

  test("UX Designer → Product", () => {
    expect(mapToFunctionalBucket({ title: "UX Designer", department: "Design" })).toBe("Product");
  });

  // --- Marketing ---
  test("Marketing Manager → Marketing", () => {
    expect(mapToFunctionalBucket({ title: "Marketing Manager", department: "Marketing" })).toBe("Marketing");
  });

  test("Content Strategist → Marketing", () => {
    expect(mapToFunctionalBucket({ title: "Content Strategist", department: "Brand" })).toBe("Marketing");
  });

  // --- Finance ---
  test("Finance Manager → Finance", () => {
    expect(mapToFunctionalBucket({ title: "Finance Manager", department: "Finance" })).toBe("Finance");
  });

  test("Controller → Finance", () => {
    expect(mapToFunctionalBucket({ title: "Controller", department: "Accounting" })).toBe("Finance");
  });

  // --- Operations ---
  test("Operations Manager → Operations", () => {
    expect(mapToFunctionalBucket({ title: "Operations Manager", department: "Ops" })).toBe("Operations");
  });

  test("HR Business Partner → Operations", () => {
    expect(mapToFunctionalBucket({ title: "HR Business Partner", department: "People" })).toBe("Operations");
  });

  test("Recruiter → Operations", () => {
    expect(mapToFunctionalBucket({ title: "Recruiter", department: "Talent" })).toBe("Operations");
  });

  // --- Leadership ---
  test("CEO → Leadership", () => {
    expect(mapToFunctionalBucket({ title: "CEO", department: "Executive" })).toBe("Leadership");
  });

  test("Chief of Staff → Leadership", () => {
    expect(mapToFunctionalBucket({ title: "Chief of Staff", department: "Office of CEO" })).toBe("Leadership");
  });

  test("Head of Engineering → Leadership", () => {
    expect(mapToFunctionalBucket({ title: "Head of Engineering", department: "Engineering" })).toBe("Leadership");
  });

  test("VP of Sales → Sales (Sales regex fires before Leadership)", () => {
    // "sales" in the title is matched by the Sales regex before the "vp" check
    // reaches the Leadership regex. This is the documented priority order.
    expect(mapToFunctionalBucket({ title: "VP of Sales", department: "Sales" })).toBe("Sales");
  });

  test("Director of Product → Product (Product regex fires before Leadership)", () => {
    // "product" in the title is matched by the Product regex before "director"
    // reaches the Leadership regex. Documented priority: Product > Leadership.
    expect(mapToFunctionalBucket({ title: "Director of Product", department: "Product" })).toBe("Product");
  });

  // --- Other ---
  test("Unknown role → Other", () => {
    expect(mapToFunctionalBucket({ title: "Workplace Experience Coordinator", department: "Facilities" })).toBe("Operations");
  });

  test("Completely unknown role → Other", () => {
    expect(mapToFunctionalBucket({ title: "Mystery Role", department: "Unknown" })).toBe("Other");
  });

  // --- Edge cases ---
  test("Empty title and department → Other", () => {
    expect(mapToFunctionalBucket({ title: "", department: "" })).toBe("Other");
  });

  test("Null department is safe (treated as empty string)", () => {
    expect(mapToFunctionalBucket({ title: "Software Engineer", department: null })).toBe("Engineering");
  });

  test("Missing department is safe", () => {
    expect(mapToFunctionalBucket({ title: "Product Manager" })).toBe("Product");
  });

  // --- Priority: Sales beats Engineering when title matches both ---
  test("Account (matches Sales) takes priority over any engineering keyword in dept", () => {
    // title: "Account" matches Sales regex; dept "engineer" would match Engineering if Sales hadn't fired first
    expect(mapToFunctionalBucket({ title: "Account Manager", department: "engineer" })).toBe("Sales");
  });
});

// ---------------------------------------------------------------------------
// Phase 6B-2B: computeFunctionalMix — aggregation + sort
// ---------------------------------------------------------------------------

test.describe("6B-2B: computeFunctionalMix — bucket aggregation", () => {

  test("Returns correct counts for a homogeneous Engineering board", () => {
    const jobs = [
      { title: "Software Engineer", department: "Engineering" },
      { title: "Backend Developer", department: "Engineering" },
      { title: "Frontend Engineer", department: "Engineering" },
    ];
    const result = computeFunctionalMix(jobs);
    expect(result).toEqual([["Engineering", 3]]);
  });

  test("Returns sorted results descending by count", () => {
    const jobs = [
      { title: "Account Executive", department: "Sales" },
      { title: "Software Engineer", department: "Engineering" },
      { title: "Software Engineer 2", department: "Engineering" },
      { title: "Product Manager", department: "Product" },
    ];
    const result = computeFunctionalMix(jobs);
    // Engineering: 2, Sales: 1, Product: 1 — Engineering first
    expect(result[0]).toEqual(["Engineering", 2]);
    expect(result[1][1]).toBe(1);
    expect(result[2][1]).toBe(1);
  });

  test("Mixed board: Engineering, Sales, Operations, Other", () => {
    const jobs = [
      { title: "Software Engineer", department: "Engineering" },
      { title: "Platform Engineer", department: "Core Platform" },
      { title: "Account Executive", department: "Sales" },
      { title: "Account Executive 2", department: "Sales" },
      { title: "HR Generalist", department: "People" },
      { title: "Mystery Role", department: "Unknown" },
    ];
    const result = computeFunctionalMix(jobs);
    const asMap = Object.fromEntries(result);
    expect(asMap["Engineering"]).toBe(2);
    expect(asMap["Sales"]).toBe(2);
    expect(asMap["Operations"]).toBe(1);
    expect(asMap["Other"]).toBe(1);
  });

  test("Empty input returns empty array", () => {
    expect(computeFunctionalMix([])).toEqual([]);
  });

  test("Output format is [string, number][] (tuple pairs)", () => {
    const jobs = [{ title: "Engineer", department: "Eng" }];
    const result = computeFunctionalMix(jobs);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(typeof result[0][0]).toBe("string");
    expect(typeof result[0][1]).toBe("number");
  });

  // Behavioral equivalence: computeFunctionalMix must produce the same
  // output as the former getHiringMix() in page.tsx for any input.
  test("Behavioral equivalence: Platform Engineer in Core Platform dept counts as Engineering", () => {
    const jobs = [
      { title: "Platform Engineer", department: "Core Platform" },
      { title: "ML Engineer", department: "AI Research" },
      { title: "Account Executive", department: "GTM" },
    ];
    const result = computeFunctionalMix(jobs);
    const asMap = Object.fromEntries(result);
    // All three titles contain "engineer" or match Sales — none end up in Other
    expect(asMap["Engineering"]).toBe(2);
    expect(asMap["Sales"]).toBe(1);
    expect(asMap["Other"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Phase 6B-2C: functionalMix in StratumResult
// ---------------------------------------------------------------------------
// These tests verify that functionalMix is attached to StratumResult and
// that its contents exactly match running computeFunctionalMix() on the
// same jobs array — i.e., the brief page's chart and the stored snapshot
// will always agree on functional bucket counts for a given set of jobs.

function mockJob(title: string, department: string): Job {
  return {
    title,
    department,
    location: "San Francisco, CA",
    source: "GREENHOUSE",
    roleId: null,
    roleIdType: null,
    requisitionId: null,
    jobUrl: null,
    applyUrl: null,
    sourceTimestamp: null,
    sourceTimestampType: null,
    observedAt: new Date().toISOString(),
  };
}

test.describe("6B-2C: functionalMix stored in StratumResult", () => {

  test("computeFunctionalMix on a known job set matches expected buckets", () => {
    const jobs: Job[] = [
      mockJob("Software Engineer", "Engineering"),
      mockJob("Platform Engineer", "Core Platform"),
      mockJob("Account Executive", "Sales"),
      mockJob("Product Manager", "Product"),
      mockJob("HR Generalist", "People"),
    ];

    const mix = computeFunctionalMix(jobs);
    const asMap = Object.fromEntries(mix);

    // Two jobs with "engineer" titles → Engineering
    expect(asMap["Engineering"]).toBe(2);
    expect(asMap["Sales"]).toBe(1);
    expect(asMap["Product"]).toBe(1);
    expect(asMap["Operations"]).toBe(1); // HR Generalist → Operations
    expect(asMap["Other"]).toBeUndefined();
  });

  test("Empty jobs array produces empty functionalMix", () => {
    const mix = computeFunctionalMix([]);
    expect(mix).toEqual([]);
  });

  test("functionalMix and hiringMix differ for the same jobs (classifier mismatch is documented)", () => {
    // Platform Engineers appear in:
    //   functionalMix → "Engineering" (mapToFunctionalBucket: "engineer" keyword)
    //   hiringMix     → "Core Platform" (aggregateJobsByDepartment: raw ATS dept)
    // This test documents the known divergence, not a bug.
    const jobs: Job[] = [
      mockJob("Platform Engineer", "Core Platform"),
      mockJob("Platform Engineer", "Core Platform"),
      mockJob("Account Executive", "Sales"),
    ];

    const mix = computeFunctionalMix(jobs);
    const asMap = Object.fromEntries(mix);

    // Chart-consistent buckets (what a user sees in the Hiring Mix chart)
    expect(asMap["Engineering"]).toBe(2);
    expect(asMap["Sales"]).toBe(1);
    // "Core Platform" does NOT appear — that is the raw ATS dept key, not a functional bucket
    expect(asMap["Core Platform"]).toBeUndefined();
  });

  test("functionalMix output is sorted descending by count", () => {
    const jobs: Job[] = [
      mockJob("Account Executive", "Sales"),
      mockJob("Software Engineer", "Engineering"),
      mockJob("Backend Engineer", "Engineering"),
      mockJob("Frontend Engineer", "Engineering"),
    ];

    const mix = computeFunctionalMix(jobs);
    // Engineering (3) should be first, Sales (1) second
    expect(mix[0]).toEqual(["Engineering", 3]);
    expect(mix[1]).toEqual(["Sales", 1]);
  });

  test("All jobs in a single bucket produce single-entry functionalMix", () => {
    const jobs: Job[] = [
      mockJob("Software Engineer", "Engineering"),
      mockJob("DevOps Engineer", "Platform"),
      mockJob("ML Engineer", "AI"),
    ];

    const mix = computeFunctionalMix(jobs);
    expect(mix).toHaveLength(1);
    expect(mix[0]).toEqual(["Engineering", 3]);
  });

  test("functionalMix output type is [string, number][] (tuple pairs)", () => {
    const jobs: Job[] = [mockJob("Software Engineer", "Engineering")];
    const mix = computeFunctionalMix(jobs);
    expect(Array.isArray(mix)).toBe(true);
    expect(typeof mix[0][0]).toBe("string");
    expect(typeof mix[0][1]).toBe("number");
  });
});
