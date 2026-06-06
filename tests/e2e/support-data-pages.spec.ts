import { randomUUID } from "node:crypto";
import { encode } from "@auth/core/jwt";
import { expect, test, type Page } from "@playwright/test";

type Persona = {
  userId: string;
  tenantId: string;
  role: "owner" | "analyst" | "viewer";
  email: string;
  name: string;
};

const baseURL = process.env.STRATUM_E2E_BASE_URL ?? "http://127.0.0.1:3002";
const sessionCookieName = "authjs.session-token";
const sessionSalt = sessionCookieName;
const runKey = `beta-packaging-${Date.now()}-${randomUUID().slice(0, 8)}`;

let ownerPersona: Persona | null = null;

async function mintSessionToken(persona: Persona): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required for beta packaging verification.");
  }

  return encode({
    secret,
    salt: sessionSalt,
    token: {
      userId: persona.userId,
      tenantId: persona.tenantId,
      role: persona.role,
      email: persona.email,
      name: persona.name,
      sub: persona.userId,
    },
  });
}

async function authenticate(page: Page, persona: Persona): Promise<void> {
  const token = await mintSessionToken(persona);
  await page.context().addCookies([
    {
      name: sessionCookieName,
      value: token,
      url: baseURL,
    },
  ]);
  await page.context().setExtraHTTPHeaders({
    "x-forwarded-for": `beta-packaging-${persona.role}-${randomUUID().slice(0, 8)}`,
  });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  const bootstrap = await request.post("/api/test/e2e/bootstrap", {
    data: { runKey },
  });
  expect(bootstrap.ok()).toBeTruthy();
  const bootstrapJson = await bootstrap.json();
  expect(bootstrapJson.success).toBeTruthy();

  const accessControl = await request.post("/api/test/e2e/access-control", {
    data: { runKey: `${runKey}-access` },
  });
  expect(accessControl.ok()).toBeTruthy();
  const accessJson = await accessControl.json();
  expect(accessJson.success).toBeTruthy();

  ownerPersona = accessJson.data.personas.ownerA as Persona;
});

test.beforeEach(async ({ page }) => {
  if (!ownerPersona) {
    throw new Error("Owner persona was not initialized.");
  }

  await authenticate(page, ownerPersona);
});

test("support page explains beta support boundaries", async ({ page }) => {
  await page.goto("/support");

  await expect(page.getByRole("heading", { name: "Support" })).toBeVisible();
  await expect(page.getByText("Stratum is currently invite-only beta software.")).toBeVisible();
  await expect(page.getByText("Support is handled directly by the Stratum team during beta.")).toBeVisible();
  await expect(
    page.getByText("Provider diagnostics on a brief may help debug source or scan problems.")
  ).toBeVisible();
});

test("data handling page explains beta data boundaries", async ({ page }) => {
  await page.goto("/data-handling");

  await expect(page.getByRole("heading", { name: "Data handling" })).toBeVisible();
  await expect(
    page.getByText("Stratum stores watched companies, scan results, saved briefs, notification candidates, and provider diagnostics needed to explain each signal.")
  ).toBeVisible();
  await expect(
    page.getByText("Self-serve export, deletion, and retention controls are not exposed yet during beta. Contact the Stratum team for support.")
  ).toBeVisible();
  await expect(
    page.getByText("Do not use Stratum for sensitive internal company data during beta.")
  ).toBeVisible();
});
