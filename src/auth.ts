import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { bootstrapUser } from "@/lib/auth/bootstrapUser";
import type { MemberRole } from "@/lib/auth/roles";
import { getWebEnv } from "@/lib/env";

const webEnv = getWebEnv();

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: webEnv.AUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  providers: [
    Google({
      clientId: webEnv.AUTH_GOOGLE_ID,
      clientSecret: webEnv.AUTH_GOOGLE_SECRET,
    }),
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      if (account?.provider === "google" && account.providerAccountId && user.email) {
        const bootstrap = await bootstrapUser({
          email: user.email,
          name: user.name ?? user.email,
          provider: account.provider,
          providerSubject: account.providerAccountId,
        });

        token.userId = bootstrap.userId;
        token.tenantId = bootstrap.tenantId;
        token.role = bootstrap.role;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string") {
        session.user.id = token.userId;
      }

      if (typeof token.tenantId === "string") {
        session.tenantId = token.tenantId;
      }

      if (typeof token.role === "string") {
        session.role = token.role as MemberRole;
      }

      return session;
    },
  },
});
