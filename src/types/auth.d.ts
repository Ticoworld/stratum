import type { DefaultSession } from "next-auth";
import type { MemberRole } from "@/lib/auth/roles";

declare module "next-auth" {
  interface Session {
    tenantId?: string;
    role?: MemberRole;
    user: DefaultSession["user"] & {
      id: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    tenantId?: string;
    role?: MemberRole;
  }
}
