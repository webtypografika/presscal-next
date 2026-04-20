// Elorus GR API tax_office codes — mapped from greeklish descriptions
// The API requires the 4-digit code, not the Greek name from AADE.
// We do fuzzy matching from AADE doy_descr (Greek) to these codes.

const DOY_MAP: Record<string, string> = {
  "8221": "Agiou Nikolaou",
  "1552": "Agriniou",
  "1101": "A' Athinon",
  "1104": "D' Athinon",
  "1106": "ST' Athinon",
  "1112": "IB' Athinon",
  "1113": "IG' Athinon",
  "1114": "ID' Athinon",
  "1116": "IST' Athinon",
  "1117": "IZ' Athinon",
  "1118": "Megalon Epixeiriseon",
  "1125": "Katoikon Eksoterikou",
  "1129": "Agiou Dimitriou",
  "1130": "Kallitheas",
  "1131": "Neas Ionias",
  "1132": "Neas Smyrnis",
  "1133": "Palaiou Falirou",
  "1134": "Chalandriou",
  "1135": "Amarousiou",
  "1136": "Agion Anargiron",
  "1137": "Aigaleo",
  "1138": "A' Peristeriou",
  "1139": "Glifadas",
  "1145": "N. Irakleiou",
  "1151": "Cholargou",
  "1152": "Vyronos",
  "1153": "Kifisias",
  "1157": "B' Peristeriou",
  "1158": "Peristeriou",
  "1159": "F.A.E. Athinon",
  "1173": "Ilioupolis",
  "1175": "Psixikou",
  "1179": "Galatsiou",
  "1190": "KEFODE Attikis",
  "1201": "A' Peiraia",
  "1203": "G' Peiraia",
  "1204": "D' Peiraia",
  "1205": "E' Peiraia",
  "1206": "F.A.E. Peiraia",
  "1207": "Ploion Peiraia",
  "1211": "Moschatou",
  "1220": "Nikaias",
  "1302": "Axarnon",
  "1303": "Elefsinas",
  "1304": "Koropiou",
  "1312": "Pallinis",
  "1411": "Thivon",
  "1421": "Livadias",
  "1531": "Mesologiou",
  "1611": "Karpenisiou",
  "1722": "Kimis",
  "1732": "Chalkidas",
  "1832": "Lamias",
  "1912": "Amfissas",
  "2111": "Argous",
  "2131": "Nafpliou",
  "2231": "Tripolis",
  "2311": "Aigiou",
  "2331": "Patron",
  "2334": "G' Patron",
  "2411": "Amaliadas",
  "2412": "Pirgou",
  "2513": "Korinthou",
  "2632": "Spartis",
  "2711": "Kalamatas",
  "3111": "Karditsas",
  "3231": "Larisas",
  "3232": "B'-G' Larisas",
  "3233": "G' Larisas",
  "3321": "Volou",
  "3323": "N. Ionias Volou",
  "3412": "Trikalon",
  "4112": "Veroias",
  "4211": "A' Thessalonikis",
  "4214": "D' Thessalonikis",
  "4215": "E' Thessalonikis",
  "4216": "ST' Thessalonikis",
  "4217": "Z' Thessalonikis",
  "4222": "Lagada",
  "4224": "F.A.E. Thessalonikis",
  "4228": "H' Thessalonikis",
  "4232": "Kalamarias",
  "4233": "Ampelokipon",
  "4234": "Ionias Thessalonikis",
  "4311": "Kastorias",
  "4411": "Kilkis",
  "4521": "Grevenon",
  "4531": "Ptolemaidas",
  "4541": "Kozanis",
  "4621": "Giannitson",
  "4631": "Edessas",
  "4711": "Katerinis",
  "4812": "Florinas",
  "4922": "Polygirou",
  "4923": "Neon Moudanion",
  "5111": "Dramas",
  "5211": "Aleksandroupolis",
  "5231": "Orestiadas",
  "5321": "Kavalas",
  "5341": "Eleftheroupolis",
  "5411": "Ksanthis",
  "5511": "Komotinis",
  "5611": "A' Serron",
  "5621": "Serron",
  "6111": "Artas",
  "6211": "Igoumenitsas",
  "6311": "Ioanninon",
  "6411": "Prevezas",
  "7121": "Thiras",
  "7151": "Naksou",
  "7161": "Parou",
  "7171": "Sirou",
  "7172": "Mikonou",
  "7231": "Mitilinis",
  "7322": "Samou",
  "7411": "Chiou",
  "7531": "Ko",
  "7542": "Rodou",
  "8110": "Irakliou",
  "8111": "A' Irakliou",
  "8112": "A' Irakliou (Moiron)",
  "8341": "Rethimnou",
  "8431": "Chanion",
  "9111": "Zakinthou",
  "9211": "Kerkiras",
  "9311": "Argostoliou",
  "9421": "Lefkadas",
};

// Greek → greeklish normalization for fuzzy matching
const GR_TO_LAT: Record<string, string> = {
  'α': 'a', 'β': 'v', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'i', 'θ': 'th',
  'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'ks', 'ο': 'o', 'π': 'p',
  'ρ': 'r', 'σ': 's', 'ς': 's', 'τ': 't', 'υ': 'i', 'φ': 'f', 'χ': 'ch', 'ψ': 'ps', 'ω': 'o',
  'ά': 'a', 'έ': 'e', 'ή': 'i', 'ί': 'i', 'ό': 'o', 'ύ': 'i', 'ώ': 'o', 'ϊ': 'i', 'ΐ': 'i', 'ϋ': 'i', 'ΰ': 'i',
};

function greeklish(s: string): string {
  return s.toLowerCase().split('').map(c => GR_TO_LAT[c] || c).join('').replace(/[^a-z0-9]/g, '');
}

/**
 * Convert AADE doy_descr (Greek, e.g. "ΚΕΦΟΔΕ ΑΤΤΙΚΗΣ") to Elorus tax_office code (e.g. "1190").
 * Returns empty string if no match found.
 */
export function doyToElorusCode(doyDescr: string): string {
  if (!doyDescr) return '';
  const norm = greeklish(doyDescr);

  // Try exact greeklish match
  for (const [code, name] of Object.entries(DOY_MAP)) {
    const nameNorm = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (norm === nameNorm || norm.includes(nameNorm) || nameNorm.includes(norm)) return code;
  }

  // Try partial match (at least 4 chars overlap)
  for (const [code, name] of Object.entries(DOY_MAP)) {
    const nameNorm = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    // Check if significant portion matches
    if (norm.length >= 4 && nameNorm.length >= 4) {
      if (norm.slice(0, 6) === nameNorm.slice(0, 6)) return code;
    }
  }

  return '';
}
