import { type AuthenticatedSession, requireAuthSession } from "@/lib/auth/session";
import { type MemberRole } from "@/lib/auth/roles";

const roleRank: Record<MemberRole, number> = {
  viewer: 0,
  analyst: 1,
  owner: 2,
};

export class AuthorizationError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function requireTenantRole(minimumRole: MemberRole): Promise<AuthenticatedSession> {
  const session = await requireAuthSession();

  if (roleRank[session.role] < roleRank[minimumRole]) {
    throw new AuthorizationError();
  }

  return session;
}
