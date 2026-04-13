// Fold-type catalog for folding machines (διπλωτική).
// Used by: postpress machine config, calculator UI, cost engine.
// Passes/folds are informational (hardcoded from industry convention);
// the price per type is configured per-machine.

export interface FoldType {
  key: string;
  label: string;
  folds: number;   // how many fold lines on the sheet
  passes: number;  // how many passes through the machine
  icon: string;    // fa-icon for UI
}

export const FOLD_TYPES: FoldType[] = [
  { key: 'half',        label: 'Μισό (A4→A5)',          folds: 1, passes: 1, icon: 'fa-grip-lines' },
  { key: 'cz',          label: 'C / Z (τρίφυλλο)',      folds: 2, passes: 1, icon: 'fa-align-justify' },
  { key: 'gate',        label: 'Gate (πόρτα)',          folds: 3, passes: 1, icon: 'fa-dungeon' },
  { key: 'doublepar',   label: 'Διπλή παράλληλη',       folds: 3, passes: 1, icon: 'fa-equals' },
  { key: 'accordion4',  label: 'Ακορντεόν 4σελ.',       folds: 3, passes: 1, icon: 'fa-bars-staggered' },
  { key: 'cross8',      label: 'Σταυρωτή 8σελ.',        folds: 3, passes: 2, icon: 'fa-plus' },
  { key: 'cross16',     label: 'Σταυρωτή 16σελ.',       folds: 4, passes: 2, icon: 'fa-table-cells' },
];

export const FOLD_TYPE_PRICE_KEYS = FOLD_TYPES.map(ft => `fold_price_${ft.key}`);

export function foldTypeByKey(key: string): FoldType | undefined {
  return FOLD_TYPES.find(ft => ft.key === key);
}
