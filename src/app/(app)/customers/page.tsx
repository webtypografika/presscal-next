import { Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';

export default function CustomersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Πελάτες"
        description="Πελατολόγιο & CRM"
        icon={Users}
        actions={
          <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light transition-colors">
            Νέος Πελάτης
          </button>
        }
      />
      <div className="rounded-xl border border-card-border bg-card-bg p-8 text-center text-muted">
        Phase 4 — Customer Management
      </div>
    </div>
  );
}
