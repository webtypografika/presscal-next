import { Scissors } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';

export default function PostpressPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Μεταφορές"
        description="Κοπτικά, Πλαστικοποίηση, Βιβλιοδεσία"
        icon={Scissors}
      />
      <div className="rounded-xl border border-card-border bg-card-bg p-8 text-center text-muted">
        Phase 5 — Postpress Management
      </div>
    </div>
  );
}
