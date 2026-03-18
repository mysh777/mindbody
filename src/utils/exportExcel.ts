import * as XLSX from 'xlsx';

export function exportToExcel(data: any[], filename: string) {
  if (data.length === 0) {
    alert('No data to export');
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(data);

  const colWidths = Object.keys(data[0]).map(key => {
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
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

  XLSX.writeFile(workbook, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
}
