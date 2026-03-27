'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

const ORG_ID = 'default-org';

// ─── GET JOBS (approved quotes with job stage) ───

export async function getJobs() {
  return prisma.quote.findMany({
    where: {
      orgId: ORG_ID,
      deletedAt: null,
      status: { in: ['approved', 'partial', 'completed'] },
    },
    include: { customer: true },
    orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }],
  });
}

// ─── UPDATE JOB STAGE ───

export async function updateJobStage(quoteId: string, stage: string) {
  const data: Record<string, unknown> = {
    jobStage: stage,
    jobStageUpdatedAt: new Date(),
  };
  // If stage is 'delivery' and completed, mark quote as completed
  if (stage === 'completed') {
    data.status = 'completed';
    data.completedAt = new Date();
    data.jobStage = 'delivery';
  }
  await prisma.quote.update({ where: { id: quoteId }, data });
  revalidatePath('/jobs');
  revalidatePath('/quotes');
  revalidatePath('/');
}

// ─── UPDATE JOB DETAILS ───

export async function updateJobDetails(quoteId: string, data: {
  deadline?: string | null;
  jobPriority?: string;
  jobNotes?: string;
}) {
  await prisma.quote.update({
    where: { id: quoteId },
    data: {
      deadline: data.deadline ? new Date(data.deadline) : null,
      jobPriority: data.jobPriority,
      jobNotes: data.jobNotes,
    },
  });
  revalidatePath('/jobs');
  revalidatePath('/');
}

// ─── PROMOTE QUOTE TO JOB ───

export async function promoteToJob(quoteId: string) {
  await prisma.quote.update({
    where: { id: quoteId },
    data: {
      jobStage: 'files',
      jobStageUpdatedAt: new Date(),
    },
  });
  revalidatePath('/jobs');
  revalidatePath('/quotes');
}
