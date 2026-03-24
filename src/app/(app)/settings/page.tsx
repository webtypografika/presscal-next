import { Settings } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Ρυθμίσεις" description="Προφίλ, Εταιρείες, Γενικά" icon={Settings} />
      <div className="rounded-xl border border-card-border bg-card-bg p-8 text-center text-muted">
        Phase 6 — Settings & Profile
      </div>
    </div>
  );
}
