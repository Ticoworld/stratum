import { randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships } from "@/db/schema/memberships";
import { tenants } from "@/db/schema/tenants";
import { users } from "@/db/schema/users";
import { recoverLegacyTenantDataForTenant } from "@/lib/auth/legacyTenantRecovery";
import type { MemberRole } from "@/lib/auth/roles";

type BootstrapUserInput = {
  email: string;
  name: string;
  provider: string;
  providerSubject: string;
};

type BootstrapUserResult = {
  userId: string;
  tenantId: string;
  role: MemberRole;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function buildPersonalTenantName(name: string, email: string): string {
  const baseName = name.trim() || email;
  return `${baseName}'s Workspace`;
}

function buildPersonalTenantSlug(userId: string): string {
  return `personal-${userId.toLowerCase()}`;
}

export async function bootstrapUser(
  input: BootstrapUserInput
): Promise<BootstrapUserResult> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim() || email;

  return db.transaction(async (tx) => {
    const [existingUser] = await tx
      .select()
      .from(users)
      .where(
        or(
          and(
            eq(users.authProvider, input.provider),
            eq(users.externalSubject, input.providerSubject)
          ),
          eq(users.email, email)
        )
      )
      .limit(1);

    const userId = existingUser?.id ?? randomUUID();

    if (existingUser) {
      await tx
        .update(users)
        .set({
          email,
          name,
          authProvider: input.provider,
          externalSubject: input.providerSubject,
        })
        .where(eq(users.id, userId));
    } else {
      await tx.insert(users).values({
        id: userId,
        email,
        name,
        authProvider: input.provider,
        externalSubject: input.providerSubject,
      });
    }

    const [existingMembership] = await tx
      .select()
      .from(memberships)
      .where(eq(memberships.userId, userId))
      .limit(1);

    if (existingMembership) {
      return {
        userId,
        tenantId: existingMembership.tenantId,
        role: existingMembership.role as MemberRole,
      };
    }

    const tenantId = userId;

    await tx
      .insert(tenants)
      .values({
        id: tenantId,
        name: buildPersonalTenantName(name, email),
        slug: buildPersonalTenantSlug(userId),
      })
      .onConflictDoNothing({
        target: tenants.slug,
      });

    await tx
      .insert(memberships)
      .values({
        tenantId,
        userId,
        role: "owner",
      })
      .onConflictDoNothing({
        target: [memberships.tenantId, memberships.userId],
      });

    const [membership] = await tx
      .select()
      .from(memberships)
      .where(
        and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId))
      )
      .limit(1);

    if (!membership) {
      throw new Error("Failed to bootstrap a default tenant membership.");
    }

    // Trigger one-time legacy data recovery during user bootstrap
    await recoverLegacyTenantDataForTenant(membership.tenantId);

    return {
      userId,
      tenantId: membership.tenantId,
      role: membership.role as MemberRole,
    };
  });
}
