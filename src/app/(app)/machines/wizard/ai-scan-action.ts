'use server';

const GEMINI_API_KEY = 'AIzaSyCqU9HQOcOA3MyWdZUMr3b6nW3Ziwo6rCU';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

interface ScanResult {
  success: boolean;
  specs: Record<string, unknown>;
  fieldsFound: number;
  error?: string;
}

export async function aiScanDigital(machineName: string): Promise<ScanResult> {
  if (!machineName.trim()) return { success: false, specs: {}, fieldsFound: 0, error: 'Δεν δόθηκε όνομα μηχανής' };

  const prompt = `You are a printing industry expert. Search the web for the EXACT technical specifications of this digital press: "${machineName}".

Find and return ONLY verified data. If you can't find a spec, set it to null.

Return a JSON object with these fields:
{
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
  "warmup_minutes": number or null
}

IMPORTANT: Return ONLY the JSON object, no markdown, no explanation.`;

  try {
    const res = await fetch(GEMINI_URL, {
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
    const numFields = ['speed_ppm_color', 'speed_ppm_bw', 'min_gsm', 'max_gsm',
      'max_sheet_ss', 'max_sheet_ls', 'min_sheet_ss', 'min_sheet_ls',
      'banner_ss', 'banner_ls', 'margin_top', 'margin_bottom', 'margin_left', 'margin_right',
      'color_stations', 'duplex_speed_factor', 'setup_sheets_waste', 'warmup_minutes'];

    for (const f of numFields) {
      if (specs[f] !== null && specs[f] !== undefined) {
        const n = Number(specs[f]);
        specs[f] = isNaN(n) ? null : n;
      }
    }

    const boolFields = ['has_booklet_maker', 'has_stapler', 'has_puncher', 'has_trimmer'];
    for (const f of boolFields) {
      if (specs[f] !== null && specs[f] !== undefined) {
        specs[f] = !!specs[f];
      }
    }

    // Validate enums
    if (specs.ink_type && !['toner', 'liquid'].includes(specs.ink_type as string)) specs.ink_type = null;
    if (specs.feed_direction && !['sef', 'lef', 'both'].includes(specs.feed_direction as string)) specs.feed_direction = null;

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
    const res = await fetch(GEMINI_URL, {
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
