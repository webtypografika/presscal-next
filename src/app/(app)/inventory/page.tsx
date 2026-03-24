import { Warehouse } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';

export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Αποθήκη Υλικών"
        description="Φύλλα, Ρολά, Φιλμ, Αναλώσιμα, Υπηρεσίες"
        icon={Warehouse}
      />
      <div className="rounded-xl border border-card-border bg-card-bg p-8 text-center text-muted">
        Phase 5 — Inventory Management
      </div>
    </div>
  );
}
