import { Calculator } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';

export default function CalculatorPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Κοστολόγηση Φύλλου"
        description="Υπολογισμός κόστους εκτύπωσης"
        icon={Calculator}
      />
      <div className="rounded-xl border border-card-border bg-card-bg p-8 text-center text-muted">
        Phase 2 — Calculator UI
      </div>
    </div>
  );
}
