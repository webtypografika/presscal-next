import { NextRequest, NextResponse } from 'next/server';

/* ── helpers ─────────────────────────────────────────────────── */

function getGeminiUrl() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Το GEMINI_API_KEY δεν έχει οριστεί.');
  return `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
}

/** Fetch with retry for 503/429 (Gemini rate limits / overload) */
async function fetchWithRetry(url: string, init: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, init);
    if (res.status === 503 || res.status === 429) {
      if (attempt < maxRetries) {
        const delay = Math.min(2000 * Math.pow(2, attempt), 10000);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
    }
    return res;
  }
  return fetch(url, init);
}

/* ── types ────────────────────────────────────────────────────── */

type Confidence = 'high' | 'medium' | 'low';

type Archetype =
  | 'flyer'
  | 'card'
  | 'brochure'
  | 'poster'
  | 'sticker'
  | 'letterhead'
  | 'envelope'
  | 'book'
  | 'catalog'
  | 'banner'
  | 'other';

interface ParsedItem {
  description: string;
  archetype: Archetype;
  quantity: number;
  dimensions: string;
  colors: string;
  paperType: string;
  finishing: string[];
  specialNotes: string;
  confidence: Confidence;
}

interface SuccessResponse {
  success: true;
  items: ParsedItem[];
  customerInterpretation: string;
  totalItems: number;
}

interface ErrorResponse {
  success: false;
  error: string;
}

/* ── prompt ───────────────────────────────────────────────────── */

function buildPrompt(emailBody: string, subject?: string, senderEmail?: string): string {
  const meta = [
    subject ? `Θέμα email: "${subject}"` : '',
    senderEmail ? `Αποστολέας: ${senderEmail}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `Είσαι ειδικός σε τυπογραφείο / ψηφιακή εκτύπωση στην Ελλάδα. Ένας πελάτης έστειλε email ζητώντας προσφορά για εκτυπωτικά προϊόντα.

Ανάλυσε το παρακάτω email και εξήγαγε κάθε ξεχωριστό προϊόν / εργασία που αναφέρεται.

${meta}

Κείμενο email:
"""
${emailBody}
"""

Για κάθε προϊόν, εξήγαγε:
- "description": σύντομη περιγραφή (π.χ. "Φυλλάδια A4 4χρωμα")
- "archetype": ένα από ["flyer","card","brochure","poster","sticker","letterhead","envelope","book","catalog","banner","other"]
- "quantity": αριθμός τεμαχίων (αν δεν αναφέρεται βάλε 0)
- "dimensions": διαστάσεις (π.χ. "210x297mm" ή "A4" ή "A5")
- "colors": χρωματικότητα (π.χ. "4/4" = CMYK δύο όψεις, "4/0" = μία όψη, "1/1" = Α/Μ δύο όψεις)
- "paperType": τύπος χαρτιού (π.χ. "150gr coated", "300gr velvet", "80gr offset")
- "finishing": πίνακας μεταποιήσεων, π.χ. ["lamination","guillotine","fold","binding","uv_varnish","die_cut","emboss","hot_foil"]
- "specialNotes": οτιδήποτε ασυνήθιστο ή επιπλέον σημειώσεις
- "confidence": "high" αν τα στοιχεία είναι ξεκάθαρα, "medium" αν υποθέτεις κάτι, "low" αν είναι ασαφές

Επίσης δώσε:
- "customerInterpretation": μια σύντομη περίληψη στα Ελληνικά (2-3 προτάσεις) του τι ζητάει ο πελάτης

Το email μπορεί να είναι στα Ελληνικά ή Αγγλικά. Αν κάποιο στοιχείο λείπει, κάνε λογική υπόθεση βάσει εμπειρίας τυπογραφείου (π.χ. αν δεν αναφέρεται χαρτί για flyer, βάλε "130gr coated" ως default).

Απάντησε ΜΟΝΟ σε JSON, χωρίς markdown, χωρίς εξήγηση:
{
  "items": [ { ... }, ... ],
  "customerInterpretation": "..."
}`;
}

/* ── JSON cleanup (same patterns as ai-scan-action.ts) ──────── */

function cleanAndParseJSON(raw: string): Record<string, unknown> {
  // Strip markdown code fences
  let text = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // Try to extract JSON object from text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Δεν βρέθηκε JSON στην απάντηση');

  // Clean common JSON issues
  const jsonStr = jsonMatch[0]
    .replace(/,\s*}/g, '}')              // trailing commas
    .replace(/,\s*]/g, ']')              // trailing commas in arrays
    .replace(/:\s*undefined/g, ': null')  // undefined -> null
    .replace(/\/\/[^\n]*/g, '')           // line comments
    .replace(/[\x00-\x1F\x7F]/g, (c) => c === '\n' || c === '\r' || c === '\t' ? c : ''); // control chars

  return JSON.parse(jsonStr) as Record<string, unknown>;
}

/* ── validation ──────────────────────────────────────────────── */

const VALID_ARCHETYPES = new Set<string>([
  'flyer', 'card', 'brochure', 'poster', 'sticker', 'letterhead',
  'envelope', 'book', 'catalog', 'banner', 'other',
]);

const VALID_CONFIDENCE = new Set<string>(['high', 'medium', 'low']);

function validateItem(raw: Record<string, unknown>): ParsedItem {
  const archetype = VALID_ARCHETYPES.has(raw.archetype as string)
    ? (raw.archetype as Archetype)
    : 'other';

  const confidence = VALID_CONFIDENCE.has(raw.confidence as string)
    ? (raw.confidence as Confidence)
    : 'medium';

  const qty = Number(raw.quantity);

  return {
    description: String(raw.description ?? ''),
    archetype,
    quantity: isNaN(qty) ? 0 : qty,
    dimensions: String(raw.dimensions ?? ''),
    colors: String(raw.colors ?? ''),
    paperType: String(raw.paperType ?? ''),
    finishing: Array.isArray(raw.finishing) ? raw.finishing.map(String) : [],
    specialNotes: String(raw.specialNotes ?? ''),
    confidence,
  };
}

/* ── route handler ───────────────────────────────────────────── */

export async function POST(req: NextRequest): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  try {
    const body = await req.json();
    const { emailBody, subject, senderEmail } = body as {
      emailBody?: string;
      subject?: string;
      senderEmail?: string;
    };

    if (!emailBody || !emailBody.trim()) {
      return NextResponse.json({ success: false, error: 'Δεν δόθηκε κείμενο email.' }, { status: 400 });
    }

    const prompt = buildPrompt(emailBody, subject, senderEmail);

    const res = await fetchWithRetry(getGeminiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { success: false, error: `Gemini API error: ${res.status} — ${err.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const json = await res.json();

    // Extract text from all parts (same pattern as ai-scan-action.ts)
    let text = '';
    for (const candidate of json.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        if (part.text) text += part.text;
      }
    }

    if (!text.trim()) {
      return NextResponse.json(
        { success: false, error: 'Κενή απάντηση από Gemini.' },
        { status: 502 },
      );
    }

    const parsed = cleanAndParseJSON(text);

    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const items = rawItems.map((item: unknown) => validateItem(item as Record<string, unknown>));

    const customerInterpretation = typeof parsed.customerInterpretation === 'string'
      ? parsed.customerInterpretation
      : '';

    return NextResponse.json({
      success: true,
      items,
      customerInterpretation,
      totalItems: items.length,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: `Parse error: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
