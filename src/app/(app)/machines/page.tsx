import { Printer } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';

export default function MachinesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Μηχανήματα"
        description="Ψηφιακά, Offset, Plotter"
        icon={Printer}
        actions={
          <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light transition-colors">
            Νέο Μηχάνημα
          </button>
        }
      />
      <div className="rounded-xl border border-card-border bg-card-bg p-8 text-center text-muted">
        Phase 5 — Machine Management
      </div>
    </div>
  );
}
