import { FileText, Calculator, Users, TrendingUp } from 'lucide-react';

const STATS = [
  { label: 'Ανοιχτές Προσφορές', value: '—', icon: FileText, color: 'text-primary' },
  { label: 'Κοστολογήσεις Σήμερα', value: '—', icon: Calculator, color: 'text-accent' },
  { label: 'Πελάτες', value: '—', icon: Users, color: 'text-success' },
  { label: 'Έσοδα Μήνα', value: '—', icon: TrendingUp, color: 'text-primary-light' },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Πίνακας Ελέγχου</h1>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="flex items-center gap-4 rounded-xl border border-card-border bg-card-bg p-5"
            >
              <div className={`${stat.color}`}>
                <Icon className="h-8 w-8" />
              </div>
              <div>
                <p className="text-sm text-muted">{stat.label}</p>
                <p className="text-2xl font-bold">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Placeholder sections */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-card-border bg-card-bg p-6">
          <h2 className="mb-4 text-lg font-semibold">Πρόσφατες Προσφορές</h2>
          <p className="text-sm text-muted">Δεν υπάρχουν ακόμα προσφορές.</p>
        </div>
        <div className="rounded-xl border border-card-border bg-card-bg p-6">
          <h2 className="mb-4 text-lg font-semibold">Γρήγορες Ενέργειες</h2>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light transition-colors">
              Νέα Κοστολόγηση
            </button>
            <button className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-colors">
              Νέα Προσφορά
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
