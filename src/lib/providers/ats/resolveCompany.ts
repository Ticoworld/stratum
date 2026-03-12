import type { AtsProvider, ResolvedCompany } from "@/lib/providers/ats/types";

const BOARD_ALIASES: Record<string, string> = {
  grok: "xai",
  xai: "xai",
  "x.ai": "xai",
  twitter: "x",
  x: "x",
};

const FALLBACK_TOKENS: Record<string, string[]> = {
  twitter: ["x"],
};

const RESOLVED_DISPLAY: Record<string, string> = {
  x: "X",
  xai: "X.AI",
};

const ALL_SOURCES: AtsProvider[] = ["GREENHOUSE", "LEVER", "ASHBY", "WORKABLE"];

const COMPANY_MAP: Record<string, AtsProvider> = {
  notion: "ASHBY",
  linear: "ASHBY",
  raycast: "ASHBY",
  ramp: "ASHBY",
  deel: "ASHBY",
  retool: "ASHBY",
  vanta: "ASHBY",
  remote: "ASHBY",
  brex: "ASHBY",
  vercel: "ASHBY",
  perplexity: "ASHBY",
  duolingo: "ASHBY",
  jobgether: "WORKABLE",
  supportyourapp: "WORKABLE",
  advisacare: "WORKABLE",
  ryanair: "WORKABLE",
  typeform: "GREENHOUSE",
  bolt: "GREENHOUSE",
  stripe: "GREENHOUSE",
  airbnb: "GREENHOUSE",
};

function toDisplayName(token: string): string {
  return RESOLVED_DISPLAY[token] ?? token.charAt(0).toUpperCase() + token.slice(1);
}

export function toBoardToken(companyName: string): string {
  const raw = companyName.trim().toLowerCase().replace(/\s+/g, "");
  return BOARD_ALIASES[raw] ?? raw;
}

export function getSourceOrder(token: string): AtsProvider[] {
  const primary = COMPANY_MAP[token];
  if (!primary) return [...ALL_SOURCES];
  return [primary, ...ALL_SOURCES.filter((source) => source !== primary)];
}

export function resolveCompany(companyName: string): ResolvedCompany {
  const normalizedName = companyName.trim();
  const primaryToken = toBoardToken(normalizedName);
  const tokensToTry = [primaryToken, ...(FALLBACK_TOKENS[primaryToken] ?? [])];

  return {
    requestedName: companyName,
    normalizedName,
    canonicalName: primaryToken,
    primaryToken,
    tokensToTry,
    sourceOrder: getSourceOrder(primaryToken),
    matchedAs: tokensToTry[0] !== primaryToken ? toDisplayName(tokensToTry[0]) : undefined,
  };
}

export function getMatchedAs(requestedName: string, resolvedToken?: string): string | undefined {
  if (!resolvedToken) return undefined;

  const normalizedRequested = requestedName.trim().toLowerCase().replace(/\s+/g, "");
  if (normalizedRequested === resolvedToken) return undefined;
  return toDisplayName(resolvedToken);
}
