/**
 * Test script for Ashby and Workable integrations.
 * Uses verified companies: notion (Ashby), jobgether/supportyourapp/advisacare (Workable).
 *
 * Run: npx tsx scripts/test-new-boards.ts
 */

import { fetchCompanyJobs } from "../src/lib/api/boards";

async function main() {
  console.log("=== Testing new job boards (Ashby & Workable) ===\n");

  // Notion -> Ashby (verified)
  console.log("--- notion (Ashby) ---");
  const notion = await fetchCompanyJobs("notion");
  console.log("Source:", notion.source);
  console.log("Job count:", notion.jobs.length);
  notion.jobs.slice(0, 3).forEach((job, i) => {
    const timestamp = job.sourceTimestamp ?? "no source timestamp";
    const link = job.jobUrl ?? job.applyUrl ?? "no url";
    console.log(`  ${i + 1}. ${job.title} | ${job.location ?? "location unavailable"} | ${job.department ?? "department unavailable"} | ${timestamp} | ${link}`);
  });
  console.log("");

  // jobgether -> Workable (verified)
  console.log("--- jobgether (Workable) ---");
  const jobgether = await fetchCompanyJobs("jobgether");
  console.log("Source:", jobgether.source);
  console.log("Job count:", jobgether.jobs.length);
  jobgether.jobs.slice(0, 3).forEach((job, i) => {
    const timestamp = job.sourceTimestamp ?? "no source timestamp";
    const link = job.jobUrl ?? job.applyUrl ?? "no url";
    console.log(`  ${i + 1}. ${job.title} | ${job.location ?? "location unavailable"} | ${job.department ?? "department unavailable"} | ${timestamp} | ${link}`);
  });
  console.log("");

  // supportyourapp -> Workable (verified)
  console.log("--- supportyourapp (Workable) ---");
  const supportyourapp = await fetchCompanyJobs("supportyourapp");
  console.log("Source:", supportyourapp.source);
  console.log("Job count:", supportyourapp.jobs.length);
  supportyourapp.jobs.slice(0, 3).forEach((job, i) => {
    const timestamp = job.sourceTimestamp ?? "no source timestamp";
    const link = job.jobUrl ?? job.applyUrl ?? "no url";
    console.log(`  ${i + 1}. ${job.title} | ${job.location ?? "location unavailable"} | ${job.department ?? "department unavailable"} | ${timestamp} | ${link}`);
  });
  console.log("");

  // advisacare -> Workable (verified)
  console.log("--- advisacare (Workable) ---");
  const advisacare = await fetchCompanyJobs("advisacare");
  console.log("Source:", advisacare.source);
  console.log("Job count:", advisacare.jobs.length);
  advisacare.jobs.slice(0, 3).forEach((job, i) => {
    const timestamp = job.sourceTimestamp ?? "no source timestamp";
    const link = job.jobUrl ?? job.applyUrl ?? "no url";
    console.log(`  ${i + 1}. ${job.title} | ${job.location ?? "location unavailable"} | ${job.department ?? "department unavailable"} | ${timestamp} | ${link}`);
  });

  console.log("\n=== Done ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
