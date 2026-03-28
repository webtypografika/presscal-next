// Sync linked consumable prices from warehouse into wizard data state
// Called on wizard load to ensure fresh prices from inventory

type SetData = (fn: (prev: Record<string, unknown>) => Record<string, unknown>) => void;

export function syncConsumables(machineId: string, setData: SetData) {
  fetch(`/api/consumables?machineId=${machineId}`)
    .then(r => r.ok ? r.json() : null)
    .then((consumables: Array<Record<string, unknown>> | null) => {
      if (!consumables?.length) return;
      setData(prev => {
        const updated = { ...prev };
        for (const c of consumables) {
          // Find which spec field this consumable is linked to
          for (const [key, val] of Object.entries(prev)) {
            if (key.endsWith('_consumable_id') && val === c.id) {
              // Found linked slot — update cost & yield from warehouse
              const prefix = key.replace('_consumable_id', '');
              const costKey = `${prefix}_cost`;
              const yieldKey = `${prefix}_life`;
              const yieldKey2 = `${prefix}_yield`;

              // Use costPerBase (€/unit) if available, otherwise costPerUnit (€/package)
              const cost = (c.costPerBase as number) || (c.costPerUnit as number) || null;
              if (cost != null && costKey in prev) updated[costKey] = cost;

              // Yield
              const yld = c.yieldPages as number | null;
              if (yld != null) {
                if (yieldKey in prev) updated[yieldKey] = yld;
                if (yieldKey2 in prev) updated[yieldKey2] = yld;
              }

              // Name
              const nameKey = key.replace('_consumable_id', '_consumable_name');
              if (c.name && nameKey in prev) updated[nameKey] = c.name;
            }
          }
        }
        return updated;
      });
    })
    .catch(() => {});
}
