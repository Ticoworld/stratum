import Link from "next/link";
import { redirect } from "next/navigation";
import {
  buildSignInRedirectPath,
  requireAuthSession,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function DataHandlingPage() {
  try {
    await requireAuthSession();
  } catch {
    redirect(buildSignInRedirectPath("/data-handling"));
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 lg:px-6 lg:py-8">
      <Link
        href="/watchlists"
        className="inline-flex items-center text-[12px] font-medium text-[color:var(--accent)] hover:underline"
      >
        Back to watchlists
      </Link>

      <header className="mt-6 space-y-3">
        <p className="text-[11px] font-medium tracking-[0.18em] uppercase" style={{ color: "var(--foreground-muted)" }}>
          Beta data handling
        </p>
        <h1 className="text-[2rem] font-semibold tracking-[-0.04em]" style={{ color: "var(--foreground)" }}>
          Data handling
        </h1>
        <p className="max-w-2xl text-[15px] leading-7" style={{ color: "var(--foreground-secondary)" }}>
          Practical notes on what Stratum stores during beta and what it does not yet expose.
        </p>
      </header>

      <section className="mt-6 rounded-[24px] border bg-[var(--surface)] p-6" style={{ borderColor: "var(--border)" }}>
        <ul className="space-y-3 text-[13px] leading-7" style={{ color: "var(--foreground-secondary)" }}>
          <li>Stratum stores watched companies, scan results, saved briefs, notification candidates, and provider diagnostics needed to explain each signal.</li>
          <li>Stratum reads supported public hiring sources. It does not claim full company coverage.</li>
          <li>Self-serve export, deletion, and retention controls are not exposed yet during beta. Contact the Stratum team for support.</li>
          <li>Do not use Stratum for sensitive internal company data during beta.</li>
        </ul>
      </section>
    </div>
  );
}
