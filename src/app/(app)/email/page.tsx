import { Mail } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';

export default function EmailPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Email" description="Gmail integration & quotes" icon={Mail} />
      <div className="rounded-xl border border-card-border bg-card-bg p-8 text-center text-muted">
        Phase 4 — Email Integration
      </div>
    </div>
  );
}
