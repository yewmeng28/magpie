/**
 * Statement descriptions are noisy: "SMP**Casa Vostra (Jem) SG", "GRAB* A-9N92OWBWW5PEAV", "BUS/MRT 907133239",
 * "LUCKIN COFFEE (SGP) PT SINGAPORE SG". These helpers reduce them to a readable name and a stable matching key.
 */

/** Payment-processor prefixes that come before the real merchant name. */
const PROCESSOR_PREFIX = /^(SMP\*+|SQ\s*\*|SP\s*\*|PAYPAL\s*\*|STRIPE\s*\*|ZETTLE_\*|SUMUP\s*\*|IZ\s*\*)\s*/;

/** Trailing noise, removed repeatedly from the end: location, country code, legal suffix, reference numbers. */
const TRAILING_NOISE = [
  /\s+(SINGAPORE|SGP|SG)(\s+\d{3})?$/,
  /\s+\d{3}\s+SG$/,
  /\s+SG$/,
  /\s*\((SGP|SG|S)\)$/,
  /\s+(PTE\.?\s*LTD\.?|PTE\.?\s*LT|PTE|PT|LTD\.?|LIMITED)$/,
  /\s+\(?\d{5,}\)?$/,
  /\s+RECURRING$/,
];

/** Clean a statement description into a display name, e.g. "LUCKIN COFFEE (SGP) PT SINGAPORE SG" → "Luckin Coffee". */
export function cleanMerchant(description: string): string {
  let text = description.toUpperCase().replace(/\s+/g, ' ').trim();
  text = text.replace(PROCESSOR_PREFIX, '');
  // Ride and food orders carry a per-trip reference: "GRAB* A-9N92OWBWW5PEAV" → "GRAB".
  text = text.replace(/^([A-Z0-9]+)\*\s*[A-Z]-[A-Z0-9]+$/, '$1');
  let previous;
  do {
    previous = text;
    for (const pattern of TRAILING_NOISE) text = text.replace(pattern, '').trim();
  } while (text !== previous);
  return titleCase(text || description.trim());
}

/**
 * The brand without its branch, letters and digits only. "LUCKINCOFFEE" and "LUCKIN COFFEE (SGP) PT" share a key,
 * and so do "CEDELE -RAFFLES CITY" and "CEDELE - BUGIS", so a rule learned at one outlet covers the others.
 */
export function merchantKey(description: string): string {
  const brand = cleanMerchant(description).split(/\s+[-@]\s*|\s*@\s+/)[0];
  return brand.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function titleCase(text: string): string {
  return text.toLowerCase().replace(/(^|[\s\-/(&.])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}
