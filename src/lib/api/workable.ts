import type { Job } from "./boards";
import { fetchWorkableSnapshot } from "@/lib/providers/ats/workable";

export async function fetchFromWorkable(companyToken: string): Promise<Job[]> {
  const snapshot = await fetchWorkableSnapshot(companyToken);
  if (snapshot.kind !== "success") {
    if (snapshot.kind === "not_found") throw new Error("NOT_FOUND");
    throw new Error(snapshot.errorMessage);
  }

  return snapshot.rawJobs.map((job) => ({
    title: job.title,
    location: job.location?.trim() || "Remote",
    department: job.department?.trim() || "General",
    updated_at: job.updatedAt ?? new Date().toISOString(),
  }));
}
