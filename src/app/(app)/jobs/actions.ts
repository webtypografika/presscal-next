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
      OR: [
        { approvedAt: { not: null } },
        { jobStage: { not: null } },
      ],
    },
    include: { customer: true, company: true },
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

    // Move job folder to archive
    const quote = await prisma.quote.findUnique({ where: { id: quoteId }, select: { jobFolderPath: true } });
    if (quote?.jobFolderPath && !quote.jobFolderPath.includes('_Archive')) {
      const { toArchivePath } = await import('@/lib/job-folder');
      data.jobFolderPath = toArchivePath(quote.jobFolderPath);
    }
  }
  await prisma.quote.update({ where: { id: quoteId }, data });
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
  // Get first stage from org settings, fallback to 'files'
  const org = await prisma.org.findUnique({ where: { id: ORG_ID }, select: { jobStages: true } });
  const stages = (org?.jobStages as any[]) || [];
  const firstStage = stages[0]?.id || 'files';
  await prisma.quote.update({
    where: { id: quoteId },
    data: { jobStage: firstStage, jobStageUpdatedAt: new Date() },
  });
  revalidatePath('/jobs');
  revalidatePath('/quotes');
}

// ─── JOB STAGES (customizable) ───

const DEFAULT_STAGES = [
  { id: 'files', label: 'Αρχεία', icon: 'fa-folder-open', color: '#60a5fa' },
  { id: 'printing', label: 'Εκτύπωση', icon: 'fa-print', color: '#f58220' },
  { id: 'cutting', label: 'Κοπή', icon: 'fa-cut', color: '#a78bfa' },
  { id: 'finishing', label: 'Φινίρισμα', icon: 'fa-magic', color: '#f472b6' },
  { id: 'delivery', label: 'Παράδοση', icon: 'fa-truck', color: '#4ade80' },
];

export async function getJobStages() {
  const org = await prisma.org.findUnique({ where: { id: ORG_ID }, select: { jobStages: true } });
  return (org?.jobStages as any[]) || DEFAULT_STAGES;
}

export async function saveJobStages(stages: { id: string; label: string; icon: string; color: string }[]) {
  await prisma.org.update({ where: { id: ORG_ID }, data: { jobStages: stages as any } });
  revalidatePath('/jobs');
  revalidatePath('/');
}
