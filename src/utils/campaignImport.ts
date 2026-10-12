import { normalizeText, phoneKey } from './campaignMatch';

export type ImportField = 'leadDate' | 'fullName' | 'firstName' | 'lastName' | 'phone' | 'email' | 'mindbodyId' | 'ignore';

export const FIELD_LABELS: Record<ImportField, string> = {
  leadDate: 'Lead date',
  fullName: 'Full name',
  firstName: 'First name',
  lastName: 'Last name',
  phone: 'Phone',
  email: 'Email',
  mindbodyId: 'Mindbody client ID',
  ignore: 'Ignore',
};

export interface ImportSheet {
  name: string;
  rows: unknown[][];
}

// Russian header words are written as escapes: UI_RULES forbids Cyrillic characters in the source.
const RU = {
  date: '\u0434\u0430\u0442',
  time: '\u0432\u0440\u0435\u043c',
  fio: '\u0444\u0438\u043e',
  client: '\u043a\u043b\u0438\u0435\u043d\u0442',
  surname: '\u0444\u0430\u043c\u0438\u043b',
  name: '\u0438\u043c\u044f',
  phone: '\u0442\u0435\u043b',
  mail: '\u043f\u043e\u0447\u0442',
};

// Checked in order; the first field whose pattern matches a header wins that column.
const HEADER_PATTERNS: [Exclude<ImportField, 'ignore'>, RegExp][] = [
  ['mindbodyId', /mindbody|client\s*id|klienta\s*id|^id$/],
  ['email', new RegExp(`e-?mail|e-?pasts|${RU.mail}`)],
  ['phone', new RegExp(`phone|^tel|talrun|mobil|${RU.phone}`)],
  ['leadDate', new RegExp(`date|datum|time|laiks|created|${RU.date}|${RU.time}`)],
  ['fullName', new RegExp(`full\\s*name|client\\s*name|^client$|^name$|vards\\s+uzvards|${RU.fio}|${RU.client}`)],
  ['lastName', new RegExp(`last\\s*name|surname|uzvards|${RU.surname}`)],
  ['firstName', new RegExp(`first\\s*name|^vards$|${RU.name}`)],
];

export async function readImportFile(file: File): Promise<ImportSheet[]> {
  const [buf, XLSX] = await Promise.all([file.arrayBuffer(), import('xlsx')]);
  const wb = /\.csv$/i.test(file.name)
    ? XLSX.read(new TextDecoder('utf-8').decode(buf), { type: 'string', cellDates: true, raw: true })
    : XLSX.read(buf, { type: 'array', cellDates: true });
  return wb.SheetNames.map(name => ({
    name,
    rows: (XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' }) as unknown[][])
      .filter(r => r.some(c => String(c ?? '').trim() !== '')),
  })).filter(s => s.rows.length > 0);
}

export function detectMapping(header: unknown[]): ImportField[] {
  const used = new Set<ImportField>();
  return header.map(h => {
    const text = normalizeText(String(h ?? ''));
    for (const [field, re] of HEADER_PATTERNS) {
      if (!used.has(field) && re.test(text)) {
        used.add(field);
        return field;
      }
    }
    return 'ignore';
  });
}

// The header is the first of the top rows that names at least two known columns.
export function detectHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (detectMapping(rows[i]).filter(f => f !== 'ignore').length >= 2) return i;
  }
  return 0;
}

const pad = (n: number) => String(n).padStart(2, '0');

function isoLocal(y: number, m: number, d: number, hh = 0, mm = 0): string | null {
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00`;
}

export function parseLeadDate(value: unknown): string | null {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return isoLocal(value.getFullYear(), value.getMonth() + 1, value.getDate(), value.getHours(), value.getMinutes());
  }
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    // Excel serial day: days since 1899-12-30, fraction = time of day.
    const d = new Date(Math.floor((value - 25569) * 86400 + 1e-6) * 1000);
    return isoLocal(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
  }
  const s = String(value ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2}))?/);
  if (m) return isoLocal(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return isoLocal(y, +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0));
  }
  return null;
}

export interface ImportRow {
  position: number;
  leadAt: string | null;
  leadRaw: string;
  name: string;
  phone: string;
  email: string;
  mindbodyId: string;
}

export function buildImportRows(rows: unknown[][], headerIndex: number, mapping: ImportField[]): ImportRow[] {
  const col = (field: ImportField) => mapping.indexOf(field);
  const cell = (r: unknown[], field: ImportField) => {
    const i = col(field);
    return i < 0 ? '' : String(r[i] ?? '').trim();
  };
  const out: ImportRow[] = [];
  rows.slice(headerIndex + 1).forEach((r, i) => {
    const name = cell(r, 'fullName') || [cell(r, 'firstName'), cell(r, 'lastName')].filter(Boolean).join(' ');
    const row: ImportRow = {
      position: i + 1,
      leadAt: col('leadDate') >= 0 ? parseLeadDate(r[col('leadDate')]) : null,
      leadRaw: col('leadDate') >= 0 ? String(r[col('leadDate')] ?? '') : '',
      name: name.replace(/\s+/g, ' '),
      phone: cell(r, 'phone'),
      email: cell(r, 'email').toLowerCase(),
      mindbodyId: cell(r, 'mindbodyId'),
    };
    if (row.name || row.phone || row.email || row.mindbodyId) out.push(row);
  });
  return out;
}

export interface ImportPerson extends ImportRow {
  rowsMerged: number;
}

// Rows sharing a phone (8+ digits) or an email are one person; the earliest lead date is kept.
export function mergeDuplicates(rows: ImportRow[]): { people: ImportPerson[]; duplicatesMerged: number } {
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const firstByKey = new Map<string, number>();
  rows.forEach((r, i) => {
    const keys = [r.email ? `e:${r.email}` : '', phoneKey(r.phone) ? `p:${phoneKey(r.phone)}` : ''].filter(Boolean);
    for (const k of keys) {
      const j = firstByKey.get(k);
      if (j === undefined) firstByKey.set(k, i);
      else parent[find(i)] = find(j);
    }
  });
  const groups = new Map<number, ImportRow[]>();
  rows.forEach((r, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), r]);
  });
  const people: ImportPerson[] = [...groups.values()].map(list => {
    const sorted = [...list].sort((a, b) => (a.leadAt ?? '9999').localeCompare(b.leadAt ?? '9999'));
    const pick = (f: 'name' | 'phone' | 'email' | 'mindbodyId') =>
      [...list].sort((a, b) => b[f].length - a[f].length)[0][f];
    return {
      ...sorted[0],
      position: Math.min(...list.map(r => r.position)),
      name: pick('name'),
      phone: pick('phone'),
      email: pick('email'),
      mindbodyId: pick('mindbodyId'),
      rowsMerged: list.length,
    };
  }).sort((a, b) => a.position - b.position);
  return { people, duplicatesMerged: rows.length - people.length };
}
