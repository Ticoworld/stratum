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

export async function getAuthSession() {
  return auth();
}

export async function requireAuthSession(): Promise<AuthenticatedSession> {
  const session = await auth();

  if (!session?.user?.id || !session.user.email || !session.tenantId || !session.role) {
    throw new Error("Unauthorized");
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
