import type { DeploymentReadinessSummary } from "@/lib/deployment/readiness";

type DeploymentReadinessNoticeProps = {
  readiness: DeploymentReadinessSummary;
};

function summarizeReportCreation(readiness: DeploymentReadinessSummary) {
  if (readiness.reportCreation.ready) {
    return "Report creation is ready.";
  }

  return readiness.reportCreation.issues[0] ?? "Report creation is blocked.";
}

export function DeploymentReadinessNotice({
  readiness,
}: DeploymentReadinessNoticeProps) {
  const tone = readiness.reportCreation.ready
    ? {
        borderColor: "rgba(59,130,246,0.35)",
        background: "rgba(59,130,246,0.12)",
        color: "#bfdbfe",
      }
    : {
        borderColor: "rgba(248,113,113,0.32)",
        background: "rgba(127,29,29,0.3)",
        color: "#fecaca",
      };

  const workerDependency =
    readiness.workerRuntime.heartbeat.status === "running" ? "Configured" : "Not configured";

  return (
    <div
      className="mt-6 rounded-2xl border px-4 py-3 text-sm leading-6"
      style={tone}
    >
      <p className="font-data text-[11px] uppercase tracking-[0.18em]">
        Deployment readiness
      </p>
      <p className="mt-2">Web app: Up.</p>
      <p>Worker dependency: {workerDependency}.</p>
      <p>{summarizeReportCreation(readiness)}</p>
    </div>
  );
}
