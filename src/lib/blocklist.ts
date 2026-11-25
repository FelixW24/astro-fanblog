/** PostgreSQL char_length counts Unicode code points, not UTF-16 units. */
export function parseBlocklistTerm(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return null;
  const term = value.normalize('NFC').trim();
  return term && [...term].length <= 120 && !term.includes('\0') ? term : null;
}

/** A literal PostgreSQL regex avoids PostgREST's ILIKE * wildcard alias. */
export function blocklistSearchPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
