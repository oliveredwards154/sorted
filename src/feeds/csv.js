// A small, dependency-free CSV parser that handles quoted fields, escaped quotes and newlines inside quotes.
// Product feeds can be tens of megabytes, so it works line-by-line over a string and yields rows as objects.

export function* parseCsv(text, { delimiter = ',' } = {}) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  let header = null;
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === '') { inQuotes = true; continue; }
    if (c === delimiter) { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') {
      row.push(field); field = '';
      if (!header) header = row.map((h) => h.trim());
      else if (row.length > 1 || row[0] !== '') yield toObject(header, row);
      row = [];
      continue;
    }
    field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (header) yield toObject(header, row);
  }
}

function toObject(header, row) {
  const o = {};
  for (let i = 0; i < header.length; i++) o[header[i]] = row[i] ?? '';
  return o;
}
