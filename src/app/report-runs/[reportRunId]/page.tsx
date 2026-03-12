import Link from "next/link";
import { notFound } from "next/navigation";
import { TruthConsole } from "@/components/truth/TruthConsole";
import { requireTenantRole } from "@/lib/auth/requireTenantRole";
import { getReportRun } from "@/lib/reports/getReportRun";

type ReportRunPageProps = {
  params: Promise<{
    reportRunId: string;
  }>;
};

export default async function ReportRunPage({ params }: ReportRunPageProps) {
  const session = await requireTenantRole("viewer");
  const { reportRunId } = await params;
  const reportRun = await getReportRun({
    reportRunId,
    tenantId: session.tenantId,
  });

  if (!reportRun) {
    notFound();
  }

  return (
    <>
      <div className="border-b px-6 py-4" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <p className="font-data text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--accent)" }}>
              Report run status
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--foreground-secondary)" }}>
              {reportRun.companyDisplayName} · {reportRun.id}
            </p>
          </div>
          <Link className="text-sm text-white underline underline-offset-4" href="/">
            Back to home
          </Link>
        </div>
      </div>
      <TruthConsole
        initialReportRunId={reportRunId}
        session={{
          name: session.user.name,
          email: session.user.email,
          role: session.role,
          tenantId: session.tenantId,
        }}
        statusOnly
      />
    </>
  );
}
