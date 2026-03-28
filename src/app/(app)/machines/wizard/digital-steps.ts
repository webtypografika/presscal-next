// Digital Machine Wizard — Step definitions

export interface WizardStep {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  canAdvance?: (data: Record<string, unknown>) => boolean;
}

export const DIGITAL_STEPS: WizardStep[] = [
  {
    id: 'welcome',
    title: 'Καλώς ήρθατε',
    subtitle: 'Ας ρυθμίσουμε τη μηχανή σας',
  },
  {
    id: 'ai_scan',
    title: 'Μοντέλο Μηχανής',
    subtitle: 'AI αναγνώριση προδιαγραφών',
    canAdvance: (d) => !!d.name,
  },
  {
    id: 'ink_type',
    title: 'Τύπος Μελανιού',
    subtitle: 'Toner ή Liquid Ink',
  },
  {
    id: 'specs',
    title: 'Τεχνικές Προδιαγραφές',
    subtitle: 'Ταχύτητες, GSM, Finishing',
    canAdvance: (d) => !!d.speed_ppm_color,
  },
  {
    id: 'media',
    title: 'Διαστάσεις Χαρτιού',
    subtitle: 'Min/Max φύλλο, Margins, Feed',
  },
  {
    id: 'color_stations',
    title: 'Χρώματα Εκτυπωτή',
    subtitle: 'Mono, CMYK ή CMYK + Special',
  },
  {
    id: 'extra_colors',
    title: 'Extra Σταθμοί',
    subtitle: 'Φυσικοί σταθμοί ειδικών χρωμάτων',
  },
  {
    id: 'cost_model',
    title: 'Μοντέλο Κοστολόγησης',
    subtitle: 'Simple (In/Out) ή Precision',
  },
  {
    id: 'costs',
    title: 'Κόστος ανά Όψη',
    subtitle: 'CPC, Toner, Drums, Service Parts',
  },
  {
    id: 'speed_zones',
    title: 'Ζώνες Ταχύτητας',
    subtitle: 'Κλιμακωτή κοστολόγηση ανά βάρος',
  },
  {
    id: 'production',
    title: 'Παραγωγή',
    subtitle: 'Φύρα, Warmup, Απόσβεση',
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

// Default specs for a new digital machine
export const DIGITAL_DEFAULTS: Record<string, unknown> = {
  cat: 'digital',
  name: '',
  notes: '',
  ink_type: 'toner',
  color_stations: 4,
  has_special_colors: false,
  extra_station_count: 1,

  // Speeds
  speed_ppm_color: null,
  speed_ppm_bw: null,
  duplex_speed_factor: 100,
  max_gsm: null,
  min_gsm: null,

  // Media
  min_sheet_ss: null,
  min_sheet_ls: null,
  max_sheet_ss: 330,
  max_sheet_ls: 487,
  banner_ss: null,
  banner_ls: null,
  margin_top: null,
  margin_bottom: null,
  margin_left: null,
  margin_right: null,
  feed_direction: 'sef',
  tac_limit: 280,  // % Total Area Coverage limit
  custom_papers: [
    { name: 'SRA3', ss: 320, ls: 450 },
    { name: '33×48.7', ss: 330, ls: 487 },
  ],

  // Finishing
  has_booklet_maker: false,
  has_stapler: false,
  has_puncher: false,
  has_trimmer: false,
  has_glue_binder: false,

  // Cost model
  cost_mode: 'simple_in',

  // Click costs
  click_a4_color: null,
  click_a4_bw: null,
  click_a3_color: null,
  click_a3_bw: null,
  click_banner_color: null,
  click_banner_bw: null,
  duplex_click_multiplier: 2,

  // Toner CMYK
  toner_c_yield: null, toner_c_cost: null,
  toner_m_yield: null, toner_m_cost: null,
  toner_y_yield: null, toner_y_cost: null,
  toner_k_yield: null, toner_k_cost: null,

  // Drums
  drum_c_life: null, drum_c_cost: null,
  drum_m_life: null, drum_m_cost: null,
  drum_y_life: null, drum_y_cost: null,
  drum_k_life: null, drum_k_cost: null,

  // Developer
  developer_type: 'integrated',
  dev_c_life: null, dev_c_cost: null,
  dev_m_life: null, dev_m_cost: null,
  dev_y_life: null, dev_y_cost: null,
  dev_k_life: null, dev_k_cost: null,

  // Coronas
  has_charge_coronas: false,
  corona_life: null, corona_cost: null,

  // Fuser, Belt, Waste
  fuser_life: null, fuser_cost: null,
  belt_life: null, belt_cost: null,
  waste_life: null, waste_cost: null,

  // Liquid ink
  ink_can_yield: null, ink_can_cost: null,
  impression_charge: null,
  blanket_life: null, blanket_cost: null,
  pip_life: null, pip_cost: null,
  mixing_fee: null,

  // Speed zones
  speed_zones: [
    { name: 'Normal', gsm_from: 80, gsm_to: 170, ppm: 60, markup: 0 },
    { name: 'Medium', gsm_from: 171, gsm_to: 250, ppm: 40, markup: 5 },
    { name: 'Thick 1', gsm_from: 251, gsm_to: 300, ppm: 25, markup: 10 },
    { name: 'Thick 2', gsm_from: 301, gsm_to: 350, ppm: 15, markup: 20 },
  ],

  // Production
  setup_sheets_waste: 10,
  warmup_minutes: 5,
  registration_spoilage_pct: 2,
  include_depreciation: false,
  machine_cost: null,
  machine_lifetime_passes: null,

  // Maintenance
  current_counter: null,
  last_service_date: '',
  maint_notes: '',
  dig_techs: [],
  maint_log: [],
  manual_url: '',
  driver_url: '',
};
