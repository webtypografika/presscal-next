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
    }),
  ],
  callbacks: {
    async signIn() {
      // Allow all Google sign-ins
      return true;
    },
    async session({ session, user }) {
      if (session.user && user) {
        (session.user as Record<string, unknown>).id = user.id;
        // Auto-assign to org if not yet
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
  debug: true, // Enable debug logs temporarily
};
