import type { WorkBook } from 'xlsx';

const loadXlsx = () => import('xlsx');

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  // Safari reads the blob asynchronously after click; revoking immediately cancels the download.
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

function autoColWidths(data: any[]): { wch: number }[] {
  if (data.length === 0) return [];
  return Object.keys(data[0]).map(key => {
    const maxLength = Math.max(
      key.length,
      ...data.map(row => {
        const val = row[key];
        if (val === null || val === undefined) return 0;
        return String(val).length;
      })
    );
    return { wch: Math.min(Math.max(maxLength + 2, 10), 50) };
  });
}

async function buildBlob(workbook: WorkBook): Promise<Blob> {
  const XLSX = await loadXlsx();
  const buf = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function stamp(base: string): string {
  return `${base}_${new Date().toISOString().split('T')[0]}.xlsx`;
}

export async function downloadWorkbook(workbook: WorkBook, filename: string) {
  triggerDownload(await buildBlob(workbook), stamp(filename));
}

export async function exportToExcel(data: any[], filename: string) {
  if (data.length === 0) {
    alert('No data to export');
    return;
  }

  const XLSX = await loadXlsx();
  const worksheet = XLSX.utils.json_to_sheet(data);
  worksheet['!cols'] = autoColWidths(data);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

  await downloadWorkbook(workbook, filename);
}

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportToCsv(rows: Record<string, unknown>[], columns: string[], filename: string) {
  if (rows.length === 0) {
    alert('No data to export');
    return;
  }
  const lines = [columns.join(','), ...rows.map(r => columns.map(c => csvCell(r[c])).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
}

interface SheetDef {
  name: string;
  data: any[];
}

export async function exportMultiSheetExcel(sheets: SheetDef[], filename: string) {
  const XLSX = await loadXlsx();
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    if (sheet.data.length === 0) continue;

    const worksheet = XLSX.utils.json_to_sheet(sheet.data);
    worksheet['!cols'] = autoColWidths(sheet.data);

    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
  }

  if (workbook.SheetNames.length === 0) {
    alert('No data to export');
    return;
  }

  await downloadWorkbook(workbook, filename);
}
