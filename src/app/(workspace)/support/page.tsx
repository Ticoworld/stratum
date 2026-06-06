import Link from "next/link";
import { redirect } from "next/navigation";
import {
  buildSignInRedirectPath,
  requireAuthSession,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  try {
    await requireAuthSession();
  } catch {
    redirect(buildSignInRedirectPath("/support"));
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
          Beta support
        </p>
        <h1 className="text-[2rem] font-semibold tracking-[-0.04em]" style={{ color: "var(--foreground)" }}>
          Support
        </h1>
        <p className="max-w-2xl text-[15px] leading-7" style={{ color: "var(--foreground-secondary)" }}>
          Small, direct support for invite-only beta users.
        </p>
      </header>

      <section className="mt-6 rounded-[24px] border bg-[var(--surface)] p-6" style={{ borderColor: "var(--border)" }}>
        <ul className="space-y-3 text-[13px] leading-7" style={{ color: "var(--foreground-secondary)" }}>
          <li>Stratum is currently invite-only beta software.</li>
          <li>Support is handled directly by the Stratum team during beta.</li>
          <li>Include the company name, watchlist entry, brief link, and what looked wrong when reporting an issue.</li>
          <li>Provider diagnostics on a brief may help debug source or scan problems.</li>
        </ul>
      </section>
    </div>
  );
}
