import { presentReport } from "@/lib/reports/presentation";
import { type ReportJson } from "@/lib/reports/reportJson";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderCitationRefs(evidenceNumbers: number[]): string {
  if (evidenceNumbers.length === 0) {
    return "";
  }

  return evidenceNumbers
    .map((evidenceNumber) => ` <a class="citation" href="#evidence-${evidenceNumber}">[${evidenceNumber}]</a>`)
    .join("");
}

function renderRows(rows: string[]): string {
  return rows.join("\n");
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function renderReportHtml(report: ReportJson): string {
  const presented = presentReport(report);
  const providerList =
    report.snapshot.providersSucceeded.length > 0
      ? report.snapshot.providersSucceeded.join(", ")
      : "None";
  const coverage = report.snapshot.zeroData
    ? "No active roles observed"
    : report.snapshot.partialData
      ? "Partial provider coverage"
      : "Captured provider coverage";

  const executiveSummaryHtml =
    presented.executiveSummary.length > 0
      ? `<ol>${renderRows(
          presented.executiveSummary.map(
            (item) => `<li>${escapeHtml(item.text)}${renderCitationRefs(item.evidenceNumbers)}</li>`
          )
        )}</ol>`
      : `<p class="empty">No executive summary items were published.</p>`;

  const claimsHtml =
    presented.claims.length > 0
      ? renderRows(
          presented.claims.map(
            (claim) => `
              <article class="card">
                <p class="eyebrow">Claim ${claim.claimNumber} · ${escapeHtml(claim.section)} · ${escapeHtml(claim.claimLabel)} · ${escapeHtml(claim.confidenceLabel)}</p>
                <h3>${escapeHtml(claim.statement)}</h3>
                <p>${escapeHtml(claim.whyItMatters)}</p>
                <p class="muted">Supporting evidence${renderCitationRefs(claim.evidenceNumbers)}</p>
              </article>
            `
          )
        )
      : `<p class="empty">No claims were published for this report.</p>`;

  const evidenceRows =
    presented.evidenceAppendix.length > 0
      ? renderRows(
          presented.evidenceAppendix.map(
            (evidence) => `
              <tr id="evidence-${evidence.evidenceNumber}">
                <td>[${evidence.evidenceNumber}]</td>
                <td>${
                  evidence.jobUrl
                    ? `<a href="${escapeHtml(evidence.jobUrl)}">${escapeHtml(evidence.jobTitle)}</a>`
                    : escapeHtml(evidence.jobTitle)
                }</td>
                <td>${escapeHtml(evidence.provider)}</td>
                <td>${escapeHtml(evidence.department ?? "Unknown")}</td>
                <td>${escapeHtml(evidence.location ?? "Unknown")}</td>
                <td>${escapeHtml(`${formatDate(evidence.sourcePostedAt)} / ${formatDate(evidence.sourceUpdatedAt)}`)}</td>
                <td>${escapeHtml(evidence.claimNumbers.map((claimNumber) => `Claim ${claimNumber}`).join(", "))}</td>
              </tr>
            `
          )
        )
      : `<tr><td colspan="7" class="empty">No cited roles were published.</td></tr>`;

  const caveatsHtml =
    presented.caveatGroups.length > 0
      ? renderRows(
          presented.caveatGroups.map(
            (group) => `
              <div class="caveat-group">
                <h3>${escapeHtml(group.title)}</h3>
                <ul>${renderRows(group.items.map((item) => `<li>${escapeHtml(item)}</li>`))}</ul>
              </div>
            `
          )
        )
      : `<p class="empty">No material limitations were recorded.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(report.company.displayName)} Report</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f1e8;
        --panel: #fffdf8;
        --ink: #1f1a14;
        --muted: #675f54;
        --line: #d7d0c2;
        --accent: #1d4d4f;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font-family: Georgia, "Times New Roman", serif;
        line-height: 1.5;
      }
      main {
        max-width: 960px;
        margin: 0 auto;
        padding: 32px 24px 48px;
      }
      header, section, footer, .card {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 16px;
      }
      header, section, footer { padding: 24px; margin-bottom: 20px; }
      .eyebrow {
        margin: 0 0 8px;
        color: var(--muted);
        font-family: "Courier New", monospace;
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      h1, h2, h3 { margin: 0 0 12px; }
      h1 { font-size: 34px; }
      h2 { font-size: 24px; color: var(--accent); }
      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px 24px;
        margin-top: 16px;
      }
      .card { padding: 16px; margin-top: 16px; }
      .muted, .empty { color: var(--muted); }
      .citation {
        color: var(--accent);
        font-weight: 600;
        text-decoration: none;
      }
      .caveat-group + .caveat-group { margin-top: 18px; }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }
      th, td {
        border-top: 1px solid var(--line);
        padding: 10px 8px 10px 0;
        text-align: left;
        vertical-align: top;
      }
      th { color: var(--muted); font-weight: 600; }
      ul, ol { margin: 0; padding-left: 20px; }
      footer { font-size: 12px; color: var(--muted); }
      @page { margin: 18mm 14mm; }
    </style>
  </head>
  <body>
    <main>
      <header>
        <p class="eyebrow">Published Report</p>
        <h1>${escapeHtml(report.company.displayName)}</h1>
        <div class="grid">
          <p>Published at: ${escapeHtml(formatDate(report.publishedAt))}</p>
          <p>Generated at: ${escapeHtml(formatDate(report.generatedAt))}</p>
          <p>Providers reviewed: ${escapeHtml(providerList)}</p>
          <p>Coverage: ${escapeHtml(coverage)}</p>
        </div>
      </header>

      <section>
        <h2>Executive Summary</h2>
        ${executiveSummaryHtml}
      </section>

      <section>
        <h2>Findings</h2>
        ${claimsHtml}
      </section>

      <section>
        <h2>Evidence Appendix</h2>
        <table>
          <thead>
            <tr>
              <th>Ref.</th>
              <th>Role title</th>
              <th>Provider</th>
              <th>Department</th>
              <th>Location</th>
              <th>Posted / updated</th>
              <th>Used in</th>
            </tr>
          </thead>
          <tbody>
            ${evidenceRows}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Limits and Open Questions</h2>
        ${caveatsHtml}
      </section>

      <footer>
        Evidence references map directly to the appendix entries in this report.
      </footer>
    </main>
  </body>
</html>`;
}
