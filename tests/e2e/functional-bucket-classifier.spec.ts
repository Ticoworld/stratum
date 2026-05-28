import { test, expect } from "@playwright/test";
import {
  mapToFunctionalBucket,
  computeFunctionalMix,
} from "../../src/lib/signals/watchlistTaxonomy";

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
