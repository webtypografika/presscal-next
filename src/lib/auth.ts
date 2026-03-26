import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/db';

const ORG_ID = 'default-org';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions['adapter'],
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ account }) {
      // Save tokens to Account for Gmail API use
      if (account) {
        try {
          await prisma.account.updateMany({
            where: { provider: account.provider, providerAccountId: account.providerAccountId },
            data: {
              access_token: account.access_token,
              refresh_token: account.refresh_token,
              expires_at: account.expires_at,
            },
          });
        } catch {
          // First sign-in — adapter will create the account
        }
      }
      return true;
    },
    async session({ session, user }) {
      if (session.user && user) {
        (session.user as Record<string, unknown>).id = user.id;
        try {
          const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
          if (dbUser && !dbUser.orgId) {
            await prisma.user.update({ where: { id: user.id }, data: { orgId: ORG_ID } });
          }
          (session.user as Record<string, unknown>).orgId = dbUser?.orgId || ORG_ID;
        } catch {
          // DB error — still allow session
        }
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
};
