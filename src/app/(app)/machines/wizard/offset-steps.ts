// Offset Machine Wizard — Step definitions

import type { WizardStep } from './digital-steps';

export const OFFSET_STEPS: WizardStep[] = [
  {
    id: 'welcome',
    title: 'Καλώς ήρθατε',
    subtitle: 'Ας ρυθμίσουμε την offset μηχανή σας',
  },
  {
    id: 'ai_scan',
    title: 'Μοντέλο Μηχανής',
    subtitle: 'AI αναγνώριση προδιαγραφών',
    canAdvance: (d) => !!d.name,
  },
  {
    id: 'paper',
    title: 'Διαστάσεις Χαρτιού',
    subtitle: 'Max/Min φύλλο σε mm',
  },
  {
    id: 'margins',
    title: 'Περιθώρια',
    subtitle: 'Gripper, Side Lay, Tail',
  },
  {
    id: 'thickness',
    title: 'Πάχος Χαρτιού',
    subtitle: 'Εύρος βάρους / πάχους',
  },
  {
    id: 'machine',
    title: 'Μηχανή',
    subtitle: 'Πύργοι, ταχύτητα, αρίθμηση, βερνίκι',
  },
  {
    id: 'production',
    title: 'Παραγωγή',
    subtitle: 'Φύρα, Setup, Wash, Απόσβεση',
  },
  {
    id: 'parts',
    title: 'Αναλώσιμα Μηχανής',
    subtitle: 'Τσίγκος, Καουτσούκ, Ρολά',
  },
  {
    id: 'inks',
    title: 'Μελάνια & Βερνίκι',
    subtitle: 'CMYK, Αλκοόλη, Coating',
  },
  {
    id: 'chemicals',
    title: 'Χημικά Καθαρισμού',
    subtitle: 'Wash ink, Water, IPA',
  },
  {
    id: 'maintenance',
    title: 'Συντήρηση',
    subtitle: 'Counter, Ημερολόγιο Service',
  },
  {
    id: 'contacts',
    title: 'Τεχνικοί & Links',
    subtitle: 'Επαφές service, εγχειρίδια',
  },
];

export const OFFSET_DEFAULTS: Record<string, unknown> = {
  cat: 'offset',
  name: '',
  notes: '',

  // Sheet dimensions
  off_max_ls: 1000,
  off_max_ss: 700,
  off_min_ls: 400,
  off_min_ss: 300,

  // Margins
  off_gripper: 10,
  off_side_margin: 5,
  off_margin_tail: 12,

  // Thickness
  off_thick_unit: 'gr',
  off_min_thick: 80,
  off_max_thick: 400,

  // Machine config
  off_towers: 4,
  off_speed: 10000,
  off_common_speed: null,
  off_perfecting: false,
  off_perfo_cnt: 0,

  // Numbering
  off_num_h: false,
  off_num_h_cnt: 0,
  off_num_min_x: 0,
  off_num_v: false,
  off_num_v_cnt: 0,
  off_num_min_y: 0,

  // Varnish
  off_has_varnish_tower: false,
  off_varnish_type: 'aqueous',

  // Production
  off_default_waste: 50,
  off_setup_min: 30,
  off_wash_min: 15,
  off_energy_hourly: 0,
  off_hour_c: 0,

  // Depreciation
  off_include_depreciation: false,
  off_machine_cost: null,
  off_depreciation_years: 15,
  off_hours_per_year: 2000,

  // Consumable rates
  off_ink_gm2: 1.5,
  off_varnish_gm2: 1.5,
  off_coating_gm2: 4.0,
  off_chem_wash_ml: 200,
  off_chem_fountain_ml_h: 500,

  // Parts
  off_include_parts: true,
  off_plate_c: 5,
  off_blanket_c: 0,
  off_blanket_life: 500000,
  off_include_rollers: false,
  off_roller_count: 16,
  off_roller_recover_c: 80,
  off_roller_recover_life: 2000000,

  // Inks
  off_include_inks: true,
  ink_c_p: 0,
  ink_m_p: 0,
  ink_y_p: 0,
  ink_k_p: 0,
  ink_var_c: 0,
  off_ink_weight: 1,
  off_coating_c: 0,

  // Toggles
  off_include_alcohol: true,
  off_include_varnish: true,
  off_include_chemicals: true,

  // Chemicals
  chem_wash_ink_c: 0,
  chem_wash_water_c: 0,
  chem_alcohol_c: 0,

  // Maintenance
  current_counter: null,
  last_service_date: '',
  maint_notes: '',
  off_techs: [],
  maint_log: [],
  manual_url: '',
  driver_url: '',
};
