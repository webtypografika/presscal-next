import { FileText } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';

export default function QuotesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Προσφορές"
        description="Διαχείριση προσφορών & πίνακας εργασιών"
        icon={FileText}
        actions={
          <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light transition-colors">
            Νέα Προσφορά
          </button>
        }
      />
      <div className="rounded-xl border border-card-border bg-card-bg p-8 text-center text-muted">
        Phase 3 — Quotes & Kanban
      </div>
    </div>
  );
}
