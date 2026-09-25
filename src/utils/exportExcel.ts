import * as XLSX from 'xlsx';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  // Fallback: if the click didn't trigger a download (sandboxed iframe),
  // open in a new tab so the browser's native save dialog appears.
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);

  // Secondary fallback via window.open for sandboxed environments
  setTimeout(() => {
    try {
      const opened = window.open(url, '_blank');
      if (opened) {
        // Revoke later so the new tab can finish loading
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
    } catch { /* blocked by sandbox — link.click fallback covers it */ }
  }, 300);
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

function buildBlob(workbook: XLSX.WorkBook): Blob {
  const buf = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function stamp(base: string): string {
  return `${base}_${new Date().toISOString().split('T')[0]}.xlsx`;
}

export function exportToExcel(data: any[], filename: string) {
  if (data.length === 0) {
    alert('No data to export');
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(data);
  worksheet['!cols'] = autoColWidths(data);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

  triggerDownload(buildBlob(workbook), stamp(filename));
}

interface SheetDef {
  name: string;
  data: any[];
}

export function exportMultiSheetExcel(sheets: SheetDef[], filename: string) {
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

  triggerDownload(buildBlob(workbook), stamp(filename));
}
