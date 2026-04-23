import { auth } from "@/auth";
import type { MemberRole } from "@/lib/auth/roles";

export type AuthenticatedSession = {
  user: {
    id: string;
    email: string;
    name?: string | null;
  };
  tenantId: string;
  role: MemberRole;
};

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function getAuthSession() {
  return auth();
}

export async function requireAuthSession(): Promise<AuthenticatedSession> {
  const session = await auth();

  if (!session?.user?.id || !session.user.email || !session.tenantId || !session.role) {
    throw new UnauthorizedError();
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
    tenantId: session.tenantId,
    role: session.role,
  };
}

export function canWriteWorkspace(role: MemberRole): boolean {
  return role === "owner" || role === "analyst";
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof UnauthorizedError;
}

export function buildSignInRedirectPath(callbackPath: string): string {
  return `/api/auth/signin?callbackUrl=${encodeURIComponent(callbackPath)}`;
}
