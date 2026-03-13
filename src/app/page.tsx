import Link from "next/link";
import { DeploymentReadinessNotice } from "@/components/system/DeploymentReadinessNotice";
import { getAuthSession } from "@/lib/auth/session";
import { getDeploymentReadinessSummary } from "@/lib/deployment/readiness";
import { TruthConsole } from "@/components/truth/TruthConsole";

export default async function Home() {
  const readiness = await getDeploymentReadinessSummary();
  const session = await getAuthSession();

  if (!session?.user?.email || !session.tenantId || !session.role) {
    return (
      <main className="min-h-screen px-6 py-10" style={{ background: "var(--background)" }}>
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-4xl flex-col justify-center">
          <p
            className="font-data text-[11px] uppercase tracking-[0.24em]"
            style={{ color: "var(--accent)" }}
          >
            Stratum
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white">
            Stratum is now a stored report workflow, not a live ATS-to-LLM demo.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7" style={{ color: "var(--foreground-secondary)" }}>
            Sign in to create a report, follow its progress, and open the published web and PDF versions.
          </p>
          <DeploymentReadinessNotice readiness={readiness} />
          <div className="mt-8">
            <Link
              className="inline-flex items-center rounded-full px-5 py-3 text-sm font-medium text-white"
              style={{ background: "var(--accent)" }}
              href="/api/auth/signin"
            >
              Sign in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <div className="px-6">
        <div className="mx-auto max-w-7xl">
          <DeploymentReadinessNotice readiness={readiness} />
        </div>
      </div>
      <TruthConsole
        session={{
          name: session.user.name,
          email: session.user.email,
          role: session.role,
          tenantId: session.tenantId,
        }}
      />
    </>
  );
}
