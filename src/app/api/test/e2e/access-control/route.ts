import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { bootstrapUser } from "@/lib/auth/bootstrapUser";
import { memberships } from "@/db/schema/memberships";
import { users } from "@/db/schema/users";
import { isEnabledTestRoute } from "@/lib/testing/testRoutes";

async function createLinkedUser(args: {
  email: string;
  name: string;
  providerSubject: string;
  tenantId: string;
  role: "analyst" | "viewer";
}) {
  const userId = randomUUID();

  await db.insert(users).values({
    id: userId,
    email: args.email,
    name: args.name,
    authProvider: "google",
    externalSubject: args.providerSubject,
  });

  await db.insert(memberships).values({
    tenantId: args.tenantId,
    userId,
    role: args.role,
  });

  return {
    userId,
    tenantId: args.tenantId,
    role: args.role,
    email: args.email,
    name: args.name,
  };
}

export async function POST(request: Request) {
  if (!isEnabledTestRoute(request)) {
    return NextResponse.json({ success: false, error: "Not found." }, { status: 404 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const runKey =
      typeof body?.runKey === "string" && body.runKey.trim() ? body.runKey.trim() : null;

    if (!runKey) {
      return NextResponse.json(
        { success: false, error: "runKey is required." },
        { status: 400 }
      );
    }

    const ownerA = await bootstrapUser({
      email: `owner-a+${runKey}@example.com`,
      name: "Owner A",
      provider: "google",
      providerSubject: `owner-a-${runKey}`,
    });
    const analystA = await createLinkedUser({
      email: `analyst-a+${runKey}@example.com`,
      name: "Analyst A",
      providerSubject: `analyst-a-${runKey}`,
      tenantId: ownerA.tenantId,
      role: "analyst",
    });
    const viewerA = await createLinkedUser({
      email: `viewer-a+${runKey}@example.com`,
      name: "Viewer A",
      providerSubject: `viewer-a-${runKey}`,
      tenantId: ownerA.tenantId,
      role: "viewer",
    });
    const ownerB = await bootstrapUser({
      email: `owner-b+${runKey}@example.com`,
      name: "Owner B",
      provider: "google",
      providerSubject: `owner-b-${runKey}`,
    });

    return NextResponse.json({
      success: true,
      data: {
        runKey,
        personas: {
          ownerA: {
            ...ownerA,
            email: `owner-a+${runKey}@example.com`,
            name: "Owner A",
          },
          analystA,
          viewerA,
          ownerB: {
            ...ownerB,
            email: `owner-b+${runKey}@example.com`,
            name: "Owner B",
          },
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Access-control fixture bootstrap failed.",
      },
      { status: 500 }
    );
  }
}
