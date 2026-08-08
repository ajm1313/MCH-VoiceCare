/**
 * Lightweight CSV parser — no external dependency.
 * Handles quoted fields, escaped quotes, and CRLF/LF line endings.
 */
export function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        current.push(field);
        field = '';
      } else if (ch === '\r') {
        // skip — handle \r\n
      } else if (ch === '\n') {
        current.push(field);
        rows.push(current);
        current = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }

  // last field/row if file doesn't end with newline
  if (field.length > 0 || current.length > 0) {
    current.push(field);
    rows.push(current);
  }

  if (rows.length === 0) return [];

  const headers = rows[0].map(h => h.trim());
  const result: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 1 && row[0].trim() === '') continue; // skip empty lines
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (row[c] ?? '').trim();
    }
    result.push(obj);
  }

  return result;
}
