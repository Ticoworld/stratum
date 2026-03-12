import { type ReportJson } from "@/lib/reports/reportJson";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderCitationRefs(citationRefs: string[]): string {
  if (citationRefs.length === 0) {
    return "";
  }

  return ` <span class="muted">[${citationRefs.map(escapeHtml).join(", ")}]</span>`;
}

function renderRows(rows: string[]): string {
  return rows.join("\n");
}

export function renderReportHtml(report: ReportJson): string {
  const providerList =
    report.snapshot.providersSucceeded.length > 0
      ? report.snapshot.providersSucceeded.join(", ")
      : "None";
  const dataMode = report.snapshot.zeroData
    ? "zero-data"
    : report.snapshot.partialData
      ? "partial"
      : "full";

  const executiveSummaryHtml =
    report.executiveSummary.length > 0
      ? `<ol>${renderRows(
          report.executiveSummary.map(
            (item) =>
              `<li>${escapeHtml(item.text)}${renderCitationRefs(item.claimRefs)}</li>`
          )
        )}</ol>`
      : `<p class="empty">No executive summary items were published.</p>`;

  const claimsHtml =
    report.claims.length > 0
      ? renderRows(
          report.claims.map(
            (claim) => `
              <article class="card">
                <p class="eyebrow">${escapeHtml(claim.section)} · ${escapeHtml(claim.claimType)} · ${escapeHtml(claim.confidence)}</p>
                <h3>${escapeHtml(claim.statement)}</h3>
                <p>${escapeHtml(claim.whyItMatters)}</p>
                <p class="muted">Citations: ${escapeHtml(claim.citationRefs.join(", "))}</p>
              </article>
            `
          )
        )
      : `<p class="empty">No claims were published for this report.</p>`;

  const evidenceRows =
    report.evidenceAppendix.length > 0
      ? renderRows(
          report.evidenceAppendix.map(
            (evidence) => `
              <tr>
                <td>${escapeHtml(evidence.jobTitle)}</td>
                <td>${escapeHtml(evidence.provider)}</td>
                <td>${escapeHtml(evidence.department ?? "Unknown")}</td>
                <td>${escapeHtml(evidence.location ?? "Unknown")}</td>
                <td>${escapeHtml(evidence.citedByClaimIds.join(", "))}</td>
              </tr>
            `
          )
        )
      : `<tr><td colspan="5" class="empty">No cited roles were published.</td></tr>`;

  const caveatsHtml =
    report.caveats.length > 0
      ? `<ul>${renderRows(
          report.caveats.map(
            (caveat) => `<li>${escapeHtml(caveat.type)}: ${escapeHtml(caveat.text)}</li>`
          )
        )}</ul>`
      : `<p class="empty">No caveats were recorded.</p>`;

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
          <p>Report version: ${escapeHtml(report.reportVersionId)}</p>
          <p>Report run: ${escapeHtml(report.reportRunId)}</p>
          <p>Generated at: ${escapeHtml(report.generatedAt)}</p>
          <p>Published at: ${escapeHtml(report.publishedAt ?? "Unpublished")}</p>
          <p>Providers: ${escapeHtml(providerList)}</p>
          <p>Data mode: ${escapeHtml(dataMode)}</p>
        </div>
      </header>

      <section>
        <h2>Executive Summary</h2>
        ${executiveSummaryHtml}
      </section>

      <section>
        <h2>Claims</h2>
        ${claimsHtml}
      </section>

      <section>
        <h2>Evidence Appendix</h2>
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Provider</th>
              <th>Department</th>
              <th>Location</th>
              <th>Claims</th>
            </tr>
          </thead>
          <tbody>
            ${evidenceRows}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Caveats</h2>
        ${caveatsHtml}
      </section>

      <footer>
        Integrity: report ${escapeHtml(report.integrity.reportSha256)}.
      </footer>
    </main>
  </body>
</html>`;
}
