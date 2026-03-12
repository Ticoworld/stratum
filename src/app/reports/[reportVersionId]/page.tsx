import Link from "next/link";
import { notFound } from "next/navigation";
import { SystemStatusBar } from "@/components/ui/SystemStatusBar";
import { requireTenantRole } from "@/lib/auth/requireTenantRole";
import { getReportVersion } from "@/lib/reports/getReportVersion";

type ReportPageProps = {
  params: Promise<{
    reportVersionId: string;
  }>;
};

function formatDate(value: string | Date | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

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
  const dataMode = report.snapshot.zeroData
    ? "zero-data"
    : report.snapshot.partialData
      ? "partial-data"
      : "completed";

  return (
    <main className="min-h-screen px-6 py-8" style={{ background: "var(--background)" }}>
      <div className="mx-auto max-w-6xl">
        <header className="border-b pb-6" style={{ borderColor: "var(--border)" }}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-data text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--accent)" }}>
                Published report
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                {report.company.displayName}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6" style={{ color: "var(--foreground-secondary)" }}>
                This page reads from a stored published report version and its persisted artifacts only. No live
                ATS fetches or live model calls occur on this read path.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 text-sm">
              <Link className="rounded-full border px-4 py-2 text-white" style={{ borderColor: "var(--border)" }} href="/">
                Back to home
              </Link>
              {htmlAvailable ? (
                <Link
                  className="rounded-full border px-4 py-2 text-white"
                  style={{ borderColor: "var(--border)" }}
                  href={`/api/reports/${reportVersion.id}/artifacts/html`}
                >
                  Open HTML
                </Link>
              ) : null}
              {pdfAvailable ? (
                <Link
                  className="rounded-full px-4 py-2 text-white"
                  style={{ background: "var(--accent)" }}
                  href={`/api/reports/${reportVersion.id}/artifacts/pdf`}
                >
                  Download PDF
                </Link>
              ) : null}
            </div>
          </div>
        </header>

        <SystemStatusBar
          dataMode={dataMode}
          htmlAvailable={htmlAvailable}
          inline
          pdfAvailable={pdfAvailable}
          reportRunId={report.reportRunId}
          reportStatus="Published"
          reportVersionId={report.reportVersionId}
        />

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Published at", value: formatDate(report.publishedAt) },
            { label: "Generated at", value: formatDate(report.generatedAt) },
            { label: "Providers succeeded", value: report.snapshot.providersSucceeded.join(", ") || "None" },
            { label: "Total normalized jobs", value: String(report.metrics.totalJobs) },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border p-5"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <p className="font-data text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--foreground-muted)" }}>
                {item.label}
              </p>
              <p className="mt-2 text-sm leading-6 text-white">{item.value}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-3xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <h2 className="text-xl font-semibold text-white">Executive summary</h2>
          {report.executiveSummary.length > 0 ? (
            <ol className="mt-4 space-y-3 text-sm leading-7" style={{ color: "var(--foreground-secondary)" }}>
              {report.executiveSummary.map((item) => (
                <li key={item.order}>
                  {item.text}
                  {item.claimRefs.length > 0 ? ` [${item.claimRefs.join(", ")}]` : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-sm" style={{ color: "var(--foreground-secondary)" }}>
              No executive summary entries were published for this report.
            </p>
          )}
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <h2 className="text-xl font-semibold text-white">Claims</h2>
            <div className="mt-4 space-y-4">
              {report.claims.map((claim) => (
                <article
                  key={claim.claimId}
                  className="rounded-2xl border p-4"
                  style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.02)" }}
                >
                  <p className="font-data text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--foreground-muted)" }}>
                    {claim.section} · {claim.claimType} · {claim.confidence}
                  </p>
                  <h3 className="mt-2 text-base font-semibold text-white">{claim.statement}</h3>
                  <p className="mt-2 text-sm leading-6" style={{ color: "var(--foreground-secondary)" }}>
                    {claim.whyItMatters}
                  </p>
                  <p className="mt-2 text-xs" style={{ color: "var(--foreground-muted)" }}>
                    Citations: {claim.citationRefs.join(", ")}
                  </p>
                </article>
              ))}
              {report.claims.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--foreground-secondary)" }}>
                  No claims were published for this report.
                </p>
              ) : null}
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-3xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <h2 className="text-xl font-semibold text-white">Methodology</h2>
              <div className="mt-4 space-y-4 text-sm leading-6" style={{ color: "var(--foreground-secondary)" }}>
                <p>Providers queried: {report.snapshot.providersQueried.join(", ") || "None"}</p>
                <p>Snapshot window start: {formatDate(report.snapshot.snapshotWindowStart)}</p>
                <p>Snapshot window end: {formatDate(report.snapshot.snapshotWindowEnd)}</p>
                <p>Prompt version: {report.model.promptVersion ?? "Not recorded"}</p>
              </div>
            </div>

            <div className="rounded-3xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <h2 className="text-xl font-semibold text-white">Caveats</h2>
              {report.caveats.length > 0 ? (
                <ul className="mt-4 space-y-3 text-sm leading-6" style={{ color: "var(--foreground-secondary)" }}>
                  {report.caveats.map((caveat, index) => (
                    <li key={`${caveat.type}-${index}`}>
                      <span className="font-medium text-white">{caveat.type}:</span> {caveat.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm" style={{ color: "var(--foreground-secondary)" }}>
                  No caveats were published for this report.
                </p>
              )}
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-3xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <h2 className="text-xl font-semibold text-white">Evidence appendix</h2>
          {report.evidenceAppendix.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead style={{ color: "var(--foreground-muted)" }}>
                  <tr>
                    <th className="pb-3 pr-4 font-medium">Title</th>
                    <th className="pb-3 pr-4 font-medium">Provider</th>
                    <th className="pb-3 pr-4 font-medium">Department</th>
                    <th className="pb-3 pr-4 font-medium">Location</th>
                    <th className="pb-3 pr-4 font-medium">Claims</th>
                  </tr>
                </thead>
                <tbody>
                  {report.evidenceAppendix.map((evidence) => (
                    <tr key={evidence.normalizedJobId} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-3 pr-4 text-white">{evidence.jobTitle}</td>
                      <td className="py-3 pr-4" style={{ color: "var(--foreground-secondary)" }}>
                        {evidence.provider}
                      </td>
                      <td className="py-3 pr-4" style={{ color: "var(--foreground-secondary)" }}>
                        {evidence.department ?? "Unknown"}
                      </td>
                      <td className="py-3 pr-4" style={{ color: "var(--foreground-secondary)" }}>
                        {evidence.location ?? "Unknown"}
                      </td>
                      <td className="py-3 pr-4" style={{ color: "var(--foreground-secondary)" }}>
                        {evidence.citedByClaimIds.join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm" style={{ color: "var(--foreground-secondary)" }}>
              No cited roles were published.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
