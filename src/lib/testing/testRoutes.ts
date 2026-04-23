const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

export function isEnabledTestRoute(request: Request): boolean {
  if (process.env.STRATUM_ENABLE_TEST_ROUTES !== "1") {
    return false;
  }

  try {
    const hostname = new URL(request.url).hostname;
    return LOCAL_HOSTNAMES.has(hostname);
  } catch {
    return false;
  }
}
