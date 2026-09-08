import fs from "fs";
import path from "path";

/** Remove BOM UTF-8 e normaliza quebras de linha. */
export function readTextFile(filePath: string): string {
  let text = fs.readFileSync(filePath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** Detecta separador (; ou ,) pela primeira linha. */
function detectDelimiter(headerLine: string): string {
  const semi = (headerLine.match(/;/g) || []).length;
  const comma = (headerLine.match(/,/g) || []).length;
  return semi > comma ? ";" : ",";
}

/** Parser CSV simples com aspas. */
export function parseCsv(text: string): string[][] {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (!lines.length) return [];

  const delim = detectDelimiter(lines[0]);
  const rows: string[][] = [];

  for (const line of lines) {
    const row: string[] = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delim && !inQuotes) {
        row.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    row.push(cur.trim());
    rows.push(row);
  }
  return rows;
}

export function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);
  const out: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every((c) => !String(c).trim())) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] != null ? String(row[idx]).trim() : "";
    });
    out.push(obj);
  }
  return out;
}

export function normalizeHeader(h: string): string {
  return String(h || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_/-]/g, "");
}

export function loadCsvFile(filePath: string): Record<string, string>[] {
  if (!fs.existsSync(filePath)) return [];
  const text = readTextFile(filePath);
  const rows = parseCsv(text);
  return rowsToObjects(rows);
}

export function findFile(dir: string, names: string[]): string | null {
  for (const name of names) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function pick(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    const nk = normalizeHeader(k);
    if (row[nk] != null && row[nk] !== "") return row[nk];
  }
  return "";
}

export function pickByIndex(row: Record<string, string>, values: string[], idx: number): string {
  if (idx >= 0 && idx < values.length) return values[idx];
  return "";
}

/** Converte data da planilha para YYYY-MM-DD. */
export function parseDataPlanilha(val: string): string {
  const s = String(val || "").trim();
  if (!s) return "";

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }

  const num = Number(s);
  if (isFinite(num) && num > 20000 && num < 60000) {
    const d = new Date((num - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return "";
}

export function parseDataHoraPlanilha(val: string): string {
  const s = String(val || "").trim();
  if (!s) return new Date().toISOString();

  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]) - 1;
    const yyyy = Number(m[3]);
    const hh = Number(m[4] || 0);
    const mi = Number(m[5] || 0);
    const ss = Number(m[6] || 0);
    return new Date(yyyy, mm, dd, hh, mi, ss).toISOString();
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();
  return new Date().toISOString();
}

export function parsePreco(val: string): number {
  if (!val) return 0;
  let s = String(val)
    .trim()
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

export function parseBool(val: string): boolean {
  const s = String(val || "").trim().toLowerCase();
  if (s === "true" || s === "verdadeiro" || s === "sim" || s === "1") return true;
  if (s === "false" || s === "falso" || s === "nao" || s === "não" || s === "0") return false;
  return s !== "";
}

export function parseIntSafe(val: string, fallback = 0): number {
  const n = Math.round(parsePreco(val));
  return isNaN(n) ? fallback : n;
}

export function getNivelPrime(item: string): string {
  const u = item.toUpperCase();
  if (u.includes("ELITE")) return "ELITE";
  if (u.includes("PLATINA")) return "PLATINA";
  if (u.includes("OURO")) return "OURO";
  return "";
}
