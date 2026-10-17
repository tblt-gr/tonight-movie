/**
 * Minimal RFC 4180 reader: quoted fields, escaped quotes, commas and newlines
 * inside quotes, CRLF, and a leading byte order mark. Blank lines are skipped.
 * `maxRows` bounds the work done on an untrusted file; `onTooManyRows` decides
 * what happens beyond it.
 */
export function parseCsv(input: string, maxRows: number, onTooManyRows: () => never): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let started = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    if (row.length > 1 || row[0] !== "") {
      if (rows.length >= maxRows) onTooManyRows();
      rows.push(row);
    }
    row = [];
    started = false;
  };

  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    started = true;
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else quoted = false;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === ",") endField();
    else if (char === "\n") endRow();
    else if (char !== "\r") field += char;
  }
  if (started) endRow();
  return rows;
}
