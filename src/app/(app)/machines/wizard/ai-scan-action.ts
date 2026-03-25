'use server';

function getGeminiUrl() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set in .env');
  return `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
}

interface ScanResult {
  success: boolean;
  specs: Record<string, unknown>;
  fieldsFound: number;
  error?: string;
}

export async function aiScanDigital(machineName: string): Promise<ScanResult> {
  if (!machineName.trim()) return { success: false, specs: {}, fieldsFound: 0, error: 'Δεν δόθηκε όνομα μηχανής' };

  const prompt = `You are a printing industry expert. Search the web for the EXACT technical specifications AND consumable costs of this digital press: "${machineName}".

Find and return ONLY verified data. If you can't find a spec, set it to null.
For consumable yields: these are rated at 5% page coverage (A4). Search for OEM part numbers and typical market prices in EUR.
For drums/fuser/belt: search for rated life in pages/impressions and replacement cost in EUR.

Return a JSON object with these fields:
{
  // === BASIC SPECS ===
  "speed_ppm_color": number or null,     // Color pages per minute (A4)
  "speed_ppm_bw": number or null,        // B&W pages per minute (A4)
  "min_gsm": number or null,             // Minimum paper weight in g/m²
  "max_gsm": number or null,             // Maximum paper weight in g/m²
  "max_sheet_ss": number or null,        // Max sheet short side in mm
  "max_sheet_ls": number or null,        // Max sheet long side in mm
  "min_sheet_ss": number or null,        // Min sheet short side in mm
  "min_sheet_ls": number or null,        // Min sheet long side in mm
  "banner_ss": number or null,           // Banner short side in mm (if supported)
  "banner_ls": number or null,           // Banner long side in mm (if supported)
  "margin_top": number or null,          // Top margin in mm
  "margin_bottom": number or null,       // Bottom margin in mm
  "margin_left": number or null,         // Left margin in mm
  "margin_right": number or null,        // Right margin in mm
  "feed_direction": "sef" or "lef" or "both" or null,
  "ink_type": "toner" or "liquid" or null,
  "color_stations": number or null,      // 1,2,4,5,6
  "has_booklet_maker": boolean or null,
  "has_stapler": boolean or null,
  "has_puncher": boolean or null,
  "has_trimmer": boolean or null,
  "duplex_speed_factor": number or null, // % of simplex speed
  "setup_sheets_waste": number or null,
  "warmup_minutes": number or null,

  // === TONER CONSUMABLES (for toner machines) ===
  "toner_k_yield": number or null,       // Black toner yield (pages at 5%)
  "toner_k_cost": number or null,        // Black toner cost EUR
  "toner_c_yield": number or null,       // Cyan toner yield
  "toner_c_cost": number or null,        // Cyan toner cost EUR
  "toner_m_yield": number or null,       // Magenta toner yield
  "toner_m_cost": number or null,        // Magenta toner cost EUR
  "toner_y_yield": number or null,       // Yellow toner yield
  "toner_y_cost": number or null,        // Yellow toner cost EUR

  // === DRUMS (for toner machines) ===
  "drum_k_life": number or null,         // Black drum life (pages)
  "drum_k_cost": number or null,         // Black drum cost EUR
  "drum_c_life": number or null,         // Cyan drum life
  "drum_c_cost": number or null,         // Cyan drum cost EUR
  "drum_m_life": number or null,         // Magenta drum life
  "drum_m_cost": number or null,         // Magenta drum cost EUR
  "drum_y_life": number or null,         // Yellow drum life
  "drum_y_cost": number or null,         // Yellow drum cost EUR

  // === DEVELOPER (for toner machines, null if integrated in drum) ===
  "developer_type": "integrated" or "separate" or null,
  "dev_k_life": number or null,          // Black developer life
  "dev_k_cost": number or null,          // Black developer cost EUR
  "dev_c_life": number or null,
  "dev_c_cost": number or null,
  "dev_m_life": number or null,
  "dev_m_cost": number or null,
  "dev_y_life": number or null,
  "dev_y_cost": number or null,

  // === SERVICE PARTS (for toner machines) ===
  "fuser_life": number or null,          // Fuser unit life (pages)
  "fuser_cost": number or null,          // Fuser unit cost EUR
  "belt_life": number or null,           // Transfer belt life (pages)
  "belt_cost": number or null,           // Transfer belt cost EUR
  "waste_life": number or null,          // Waste toner container life (pages)
  "waste_cost": number or null,          // Waste toner container cost EUR
  "has_charge_coronas": boolean or null,
  "corona_life": number or null,         // Corona wire/unit life (pages)
  "corona_cost": number or null,         // Corona wire/unit cost EUR

  // === HP INDIGO / LIQUID INK CONSUMABLES ===
  "ink_can_yield": number or null,       // ElectroInk can yield (impressions)
  "ink_can_cost": number or null,        // ElectroInk can cost EUR
  "impression_charge": number or null,   // Per-impression charge EUR
  "blanket_life": number or null,        // Blanket (BID) life (impressions)
  "blanket_cost": number or null,        // Blanket (BID) cost EUR
  "pip_life": number or null,            // PIP life (impressions)
  "pip_cost": number or null             // PIP cost EUR
}

IMPORTANT: Return ONLY the JSON object, no markdown, no explanation. For consumable prices use current EUR market prices (OEM or compatible). If the machine uses liquid ink (HP Indigo), fill the HP Indigo fields and leave toner fields null, and vice versa.`;

  try {
    const res = await fetch(getGeminiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
        tools: [{ google_search: {} }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, specs: {}, fieldsFound: 0, error: `Gemini API error: ${res.status} — ${err.slice(0, 200)}` };
    }

    const json = await res.json();

    // Extract text from all parts
    let text = '';
    for (const candidate of json.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        if (part.text) text += part.text;
      }
    }

    // Strip markdown code fences
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    // Try to extract JSON object from text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, specs: {}, fieldsFound: 0, error: 'Δεν βρέθηκε JSON στην απάντηση' };
    }

    // Clean common JSON issues
    let jsonStr = jsonMatch[0]
      .replace(/,\s*}/g, '}')           // trailing commas
      .replace(/,\s*]/g, ']')           // trailing commas in arrays
      .replace(/:\s*undefined/g, ': null') // undefined → null
      .replace(/\/\/[^\n]*/g, '')        // line comments
      .replace(/[\x00-\x1F\x7F]/g, (c) => c === '\n' || c === '\r' || c === '\t' ? c : ''); // control chars

    const specs = JSON.parse(jsonStr) as Record<string, unknown>;

    // Validate & clean
    const numFields = [
      'speed_ppm_color', 'speed_ppm_bw', 'min_gsm', 'max_gsm',
      'max_sheet_ss', 'max_sheet_ls', 'min_sheet_ss', 'min_sheet_ls',
      'banner_ss', 'banner_ls', 'margin_top', 'margin_bottom', 'margin_left', 'margin_right',
      'color_stations', 'duplex_speed_factor', 'setup_sheets_waste', 'warmup_minutes',
      // Toner consumables
      'toner_k_yield', 'toner_k_cost', 'toner_c_yield', 'toner_c_cost',
      'toner_m_yield', 'toner_m_cost', 'toner_y_yield', 'toner_y_cost',
      // Drums
      'drum_k_life', 'drum_k_cost', 'drum_c_life', 'drum_c_cost',
      'drum_m_life', 'drum_m_cost', 'drum_y_life', 'drum_y_cost',
      // Developer
      'dev_k_life', 'dev_k_cost', 'dev_c_life', 'dev_c_cost',
      'dev_m_life', 'dev_m_cost', 'dev_y_life', 'dev_y_cost',
      // Service parts
      'fuser_life', 'fuser_cost', 'belt_life', 'belt_cost',
      'waste_life', 'waste_cost', 'corona_life', 'corona_cost',
      // HP Indigo
      'ink_can_yield', 'ink_can_cost', 'impression_charge',
      'blanket_life', 'blanket_cost', 'pip_life', 'pip_cost',
    ];

    for (const f of numFields) {
      if (specs[f] !== null && specs[f] !== undefined) {
        const n = Number(specs[f]);
        specs[f] = isNaN(n) ? null : n;
      }
    }

    const boolFields = ['has_booklet_maker', 'has_stapler', 'has_puncher', 'has_trimmer', 'has_charge_coronas'];
    for (const f of boolFields) {
      if (specs[f] !== null && specs[f] !== undefined) {
        specs[f] = !!specs[f];
      }
    }

    // Validate enums
    if (specs.ink_type && !['toner', 'liquid'].includes(specs.ink_type as string)) specs.ink_type = null;
    if (specs.feed_direction && !['sef', 'lef', 'both'].includes(specs.feed_direction as string)) specs.feed_direction = null;
    if (specs.developer_type && !['integrated', 'separate'].includes(specs.developer_type as string)) specs.developer_type = null;

    // GSM sanity: if < 2, probably mm not GSM
    if (specs.min_gsm && (specs.min_gsm as number) < 2) specs.min_gsm = (specs.min_gsm as number) * 1000;
    if (specs.max_gsm && (specs.max_gsm as number) < 2) specs.max_gsm = (specs.max_gsm as number) * 1000;

    const fieldsFound = Object.values(specs).filter((v) => v !== null && v !== undefined).length;

    return { success: true, specs, fieldsFound };
  } catch (e) {
    return { success: false, specs: {}, fieldsFound: 0, error: `Parse error: ${(e as Error).message}` };
  }
}

export async function aiScanOffset(machineName: string): Promise<ScanResult> {
  if (!machineName.trim()) return { success: false, specs: {}, fieldsFound: 0, error: 'Δεν δόθηκε όνομα μηχανής' };

  const prompt = `You are a printing industry expert. Search the web for the EXACT technical specifications of this offset press: "${machineName}".

Find and return ONLY verified data. If you can't find a spec, set it to null.

Return a JSON object with these fields:
{
  "off_max_ls": number or null,          // Max sheet long side in mm
  "off_max_ss": number or null,          // Max sheet short side in mm
  "off_min_ls": number or null,          // Min sheet long side in mm
  "off_min_ss": number or null,          // Min sheet short side in mm
  "off_gripper": number or null,         // Gripper margin mm
  "off_side_margin": number or null,     // Side lay margin mm
  "off_margin_tail": number or null,     // Tail margin mm
  "off_min_thick": number or null,       // Min paper weight g/m²
  "off_max_thick": number or null,       // Max paper weight g/m²
  "off_towers": number or null,          // Number of color towers (2-5)
  "off_speed": number or null,           // Max speed sheets/hour
  "off_common_speed": number or null,    // Typical speed sheets/hour
  "off_perfecting": boolean or null,     // Has perfecting unit
  "off_has_varnish_tower": boolean or null,
  "off_varnish_type": "aqueous" or "uv" or null,
  "off_num_h": boolean or null,          // Horizontal numbering
  "off_num_v": boolean or null,          // Vertical numbering
  "off_default_waste": number or null,   // Default waste sheets
  "off_setup_min": number or null,       // Setup time in minutes
  "off_wash_min": number or null         // Wash time in minutes
}

IMPORTANT: Return ONLY the JSON object, no markdown, no explanation.`;

  try {
    const res = await fetch(getGeminiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
        tools: [{ google_search: {} }],
      }),
    });

    if (!res.ok) {
      return { success: false, specs: {}, fieldsFound: 0, error: `Gemini API error: ${res.status}` };
    }

    const json = await res.json();
    let text = '';
    for (const candidate of json.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        if (part.text) text += part.text;
      }
    }
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { success: false, specs: {}, fieldsFound: 0, error: 'Δεν βρέθηκε JSON' };
    const jsonStr = jsonMatch[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']').replace(/:\s*undefined/g, ': null').replace(/\/\/[^\n]*/g, '');
    const specs = JSON.parse(jsonStr) as Record<string, unknown>;

    const fieldsFound = Object.values(specs).filter((v) => v !== null && v !== undefined).length;
    return { success: true, specs, fieldsFound };
  } catch (e) {
    return { success: false, specs: {}, fieldsFound: 0, error: `Parse error: ${(e as Error).message}` };
  }
}
