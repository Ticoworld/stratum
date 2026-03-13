import { notFound } from "next/navigation";
import { ReportArtifactActions } from "@/components/reports/ReportArtifactActions";
import { SystemStatusBar } from "@/components/ui/SystemStatusBar";
import { getReportArtifactStatus } from "@/lib/artifacts/status";
import { requireTenantRole } from "@/lib/auth/requireTenantRole";
import { getReportVersion } from "@/lib/reports/getReportVersion";
import {
  presentDataMode,
  presentProviderName,
  presentReport,
} from "@/lib/reports/presentation";

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
  const presented = presentReport(report);
  const htmlStatus = getReportArtifactStatus(reportVersion.artifacts, "html");
  const pdfStatus = getReportArtifactStatus(reportVersion.artifacts, "pdf");
  const dataMode = report.snapshot.zeroData
    ? "zero-data"
    : report.snapshot.partialData
      ? "partial-data"
      : "completed";
  const coverageLabel = presentDataMode(dataMode);
  const providersReviewed =
    report.snapshot.providersSucceeded.map((provider) => presentProviderName(provider)).join(", ") || "None";
  const providersQueried =
    report.snapshot.providersQueried.map((provider) => presentProviderName(provider)).join(", ") || "None";

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
                Published from the stored hiring snapshot captured for this report date. The report is fixed at
                publication and remains tied to the evidence cited below.
              </p>
            </div>

            <ReportArtifactActions
              reportVersionId={reportVersion.id}
              htmlStatus={htmlStatus}
              pdfStatus={pdfStatus}
            />
          </div>
        </header>

        <SystemStatusBar
          dataMode={dataMode}
          htmlStatus={htmlStatus}
          inline
          pdfStatus={pdfStatus}
          reportStatus="Published"
        />

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Published at", value: formatDate(report.publishedAt) },
            { label: "Generated at", value: formatDate(report.generatedAt) },
            { label: "Providers reviewed", value: providersReviewed },
            { label: "Roles captured", value: String(report.metrics.totalJobs) },
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
          {report.snapshot.partialData ? (
            <div
              className="mt-4 rounded-2xl border px-4 py-3 text-sm leading-6"
              style={{
                borderColor: "rgba(250,204,21,0.28)",
                background: "rgba(113,63,18,0.18)",
                color: "#fef3c7",
              }}
            >
              Coverage is partial for this report. The findings below are limited to the providers that were
              successfully captured.
            </div>
          ) : null}
          {presented.executiveSummary.length > 0 ? (
            <ol className="mt-4 space-y-3 text-sm leading-7" style={{ color: "var(--foreground-secondary)" }}>
              {presented.executiveSummary.map((item) => (
                <li key={item.order}>
                  {item.text}
                  {item.evidenceNumbers.length > 0 ? (
                    <span className="ml-1">
                      {item.evidenceNumbers.map((evidenceNumber) => (
                        <a
                          key={evidenceNumber}
                          className="underline underline-offset-4"
                          href={`#evidence-${evidenceNumber}`}
                          style={{ color: "var(--accent)" }}
                        >
                          [{evidenceNumber}]
                        </a>
                      ))}
                    </span>
                  ) : null}
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
            <h2 className="text-xl font-semibold text-white">Findings</h2>
            <div className="mt-4 space-y-4">
              {presented.claims.map((claim) => (
                <article
                  key={claim.claimId}
                  className="rounded-2xl border p-4"
                  style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.02)" }}
                >
                  <p className="font-data text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--foreground-muted)" }}>
                    Finding {claim.claimNumber} · {claim.section} · {claim.claimLabel} · {claim.confidenceLabel}
                  </p>
                  <h3 className="mt-2 text-base font-semibold text-white">{claim.statement}</h3>
                  <p className="mt-2 text-sm leading-6" style={{ color: "var(--foreground-secondary)" }}>
                    {claim.whyItMatters}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {claim.evidenceNumbers.map((evidenceNumber) => (
                      <a
                        key={evidenceNumber}
                        className="rounded-full border px-2.5 py-1 underline underline-offset-4"
                        href={`#evidence-${evidenceNumber}`}
                        style={{ borderColor: "var(--border)", color: "var(--foreground-secondary)" }}
                      >
                        [{evidenceNumber}]
                      </a>
                    ))}
                  </div>
                </article>
              ))}
              {presented.claims.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--foreground-secondary)" }}>
                  No claims were published for this report.
                </p>
              ) : null}
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-3xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <h2 className="text-xl font-semibold text-white">Report basis</h2>
              <div className="mt-4 space-y-4 text-sm leading-6" style={{ color: "var(--foreground-secondary)" }}>
                <p>Providers reviewed: {providersQueried}</p>
                <p>Snapshot window start: {formatDate(report.snapshot.snapshotWindowStart)}</p>
                <p>Snapshot window end: {formatDate(report.snapshot.snapshotWindowEnd)}</p>
                <p>Coverage: {coverageLabel}</p>
              </div>
            </div>

            <div className="rounded-3xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <h2 className="text-xl font-semibold text-white">Limits and open questions</h2>
              {presented.caveatGroups.length > 0 ? (
                <div className="mt-4 space-y-5">
                  {presented.caveatGroups.map((group) => (
                    <div key={group.title}>
                      <h3 className="text-sm font-semibold text-white">{group.title}</h3>
                      <ul className="mt-2 space-y-3 text-sm leading-6" style={{ color: "var(--foreground-secondary)" }}>
                        {group.items.map((item, index) => (
                          <li key={`${group.title}-${index}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm" style={{ color: "var(--foreground-secondary)" }}>
                  No material limitations were recorded for this report.
                </p>
              )}
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-3xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <h2 className="text-xl font-semibold text-white">Evidence appendix</h2>
          {presented.evidenceAppendix.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead style={{ color: "var(--foreground-muted)" }}>
                  <tr>
                    <th className="pb-3 pr-4 font-medium">Ref.</th>
                    <th className="pb-3 pr-4 font-medium">Role title</th>
                    <th className="pb-3 pr-4 font-medium">Provider</th>
                    <th className="pb-3 pr-4 font-medium">Department</th>
                    <th className="pb-3 pr-4 font-medium">Location</th>
                    <th className="pb-3 pr-4 font-medium">Posted / updated</th>
                    <th className="pb-3 pr-4 font-medium">Used in</th>
                  </tr>
                </thead>
                <tbody>
                  {presented.evidenceAppendix.map((evidence) => (
                    <tr
                      key={evidence.normalizedJobId}
                      id={`evidence-${evidence.evidenceNumber}`}
                      className="border-t"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <td className="py-3 pr-4 text-white">[{evidence.evidenceNumber}]</td>
                      <td className="py-3 pr-4 text-white">
                        {evidence.jobUrl ? (
                          <a className="underline underline-offset-4" href={evidence.jobUrl} rel="noreferrer" target="_blank">
                            {evidence.jobTitle}
                          </a>
                        ) : (
                          evidence.jobTitle
                        )}
                      </td>
                      <td className="py-3 pr-4" style={{ color: "var(--foreground-secondary)" }}>
                        {presentProviderName(evidence.provider)}
                      </td>
                      <td className="py-3 pr-4" style={{ color: "var(--foreground-secondary)" }}>
                        {evidence.department ?? "Unknown"}
                      </td>
                      <td className="py-3 pr-4" style={{ color: "var(--foreground-secondary)" }}>
                        {evidence.location ?? "Unknown"}
                      </td>
                      <td className="py-3 pr-4" style={{ color: "var(--foreground-secondary)" }}>
                        {formatDate(evidence.sourcePostedAt)} / {formatDate(evidence.sourceUpdatedAt)}
                      </td>
                      <td className="py-3 pr-4" style={{ color: "var(--foreground-secondary)" }}>
                        {evidence.claimNumbers.map((claimNumber) => `Claim ${claimNumber}`).join(", ")}
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
