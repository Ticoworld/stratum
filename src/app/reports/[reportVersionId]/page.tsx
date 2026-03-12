import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantRole } from "@/lib/auth/requireTenantRole";
import { getReportVersion } from "@/lib/reports/getReportVersion";

type ReportPageProps = {
  params: Promise<{
    reportVersionId: string;
  }>;
};

export default async function ReportVersionPage({ params }: ReportPageProps) {
  const session = await requireTenantRole("viewer");
  const { reportVersionId } = await params;
  const reportVersion = await getReportVersion({
    reportVersionId,
    tenantId: session.tenantId,
  });

  if (!reportVersion) {
    notFound();
  }

  const report = reportVersion.report;
  const htmlAvailable = reportVersion.artifacts.some(
    (artifact) => artifact.artifactType === "html" && artifact.status === "available"
  );
  const pdfAvailable = reportVersion.artifacts.some(
    (artifact) => artifact.artifactType === "pdf" && artifact.status === "available"
  );

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6">
          <p className="text-sm uppercase tracking-[0.2em] text-neutral-400">Published Report</p>
          <h1 className="mt-3 text-3xl font-semibold">{report.company.displayName}</h1>
          <div className="mt-4 grid gap-2 text-sm text-neutral-300 md:grid-cols-2">
            <p>Report version: {report.reportVersionId}</p>
            <p>Report run: {report.reportRunId}</p>
            <p>Generated at: {report.generatedAt}</p>
            <p>Published at: {report.publishedAt ?? "Unpublished"}</p>
            <p>Providers: {report.snapshot.providersSucceeded.join(", ") || "None"}</p>
            <p>HTML artifact: {htmlAvailable ? "available" : "unavailable"}</p>
            <p>PDF artifact: {pdfAvailable ? "available" : "unavailable"}</p>
            <p>
              Data mode:{" "}
              {report.snapshot.zeroData
                ? "zero-data"
                : report.snapshot.partialData
                  ? "partial"
                  : "full"}
            </p>
          </div>
          <div className="mt-4 flex gap-3 text-sm">
            {htmlAvailable ? (
              <Link
                className="rounded-full border border-neutral-700 px-4 py-2 text-neutral-100"
                href={`/api/reports/${reportVersion.id}/artifacts/html`}
              >
                Open HTML artifact
              </Link>
            ) : null}
            {pdfAvailable ? (
              <Link
                className="rounded-full border border-neutral-700 px-4 py-2 text-neutral-100"
                href={`/api/reports/${reportVersion.id}/artifacts/pdf`}
              >
                Download PDF artifact
              </Link>
            ) : null}
          </div>
        </header>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6">
          <h2 className="text-xl font-semibold">Executive Summary</h2>
          <ol className="mt-4 space-y-3 text-neutral-200">
            {report.executiveSummary.map((item) => (
              <li key={item.order}>
                {item.text}
                {item.claimRefs.length > 0 ? ` [${item.claimRefs.join(", ")}]` : null}
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6">
          <h2 className="text-xl font-semibold">Claims</h2>
          <div className="mt-4 space-y-4">
            {report.claims.map((claim) => (
              <article key={claim.claimId} className="rounded-xl border border-neutral-800 p-4">
                <p className="text-sm uppercase tracking-[0.15em] text-neutral-400">
                  {claim.section} · {claim.claimType} · {claim.confidence}
                </p>
                <h3 className="mt-2 text-lg font-medium">{claim.statement}</h3>
                <p className="mt-2 text-sm text-neutral-300">{claim.whyItMatters}</p>
                <p className="mt-2 text-xs text-neutral-400">
                  Citations: {claim.citationRefs.join(", ")}
                </p>
              </article>
            ))}
            {report.claims.length === 0 ? (
              <p className="text-sm text-neutral-400">No claims were published for this report.</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6">
          <h2 className="text-xl font-semibold">Evidence Appendix</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-neutral-200">
              <thead className="text-neutral-400">
                <tr>
                  <th className="pb-3 pr-4">Title</th>
                  <th className="pb-3 pr-4">Provider</th>
                  <th className="pb-3 pr-4">Department</th>
                  <th className="pb-3 pr-4">Location</th>
                  <th className="pb-3 pr-4">Claims</th>
                </tr>
              </thead>
              <tbody>
                {report.evidenceAppendix.map((evidence) => (
                  <tr key={evidence.normalizedJobId} className="border-t border-neutral-800">
                    <td className="py-3 pr-4">{evidence.jobTitle}</td>
                    <td className="py-3 pr-4">{evidence.provider}</td>
                    <td className="py-3 pr-4">{evidence.department ?? "Unknown"}</td>
                    <td className="py-3 pr-4">{evidence.location ?? "Unknown"}</td>
                    <td className="py-3 pr-4">{evidence.citedByClaimIds.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.evidenceAppendix.length === 0 ? (
              <p className="mt-4 text-sm text-neutral-400">No cited roles were published.</p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
