/**
 * Stratum MCP Server - "Stratum-Intelligence"
 * Exposes analyze_company tool; uses stdio transport.
 *
 * Run: npm run mcp   OR   npx tsx src/mcp-server.ts
 */

import { config } from "dotenv";

config();
config({ path: ".env.local" });

import { z } from "zod";
import { StratumInvestigator } from "@/lib/services/StratumInvestigator";

async function main() {
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");

  const server = new McpServer({
    name: "Stratum-Intelligence",
    version: "1.0.0",
  });

  server.tool(
    "analyze_company",
    {
      companyName: z.string().describe("Company name to analyze hiring strategy (e.g., Airbnb, Stripe)"),
    },
    async ({ companyName }) => {
      try {
        const investigator = new StratumInvestigator();
        const result = await investigator.investigate(companyName);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[Stratum MCP] Stratum-Intelligence running on stdio");
}

main().catch((e) => {
  console.error("[Stratum MCP] Fatal:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
