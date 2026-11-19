export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escape = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  triggerDownload(filename.endsWith('.csv') ? filename : `${filename}.csv`, csv, 'text/csv;charset=utf-8;');
}

// Generates valid Excel SpreadsheetML (.xls) recognized natively by Microsoft Excel & LibreOffice
export function downloadExcel(filename: string, sheetTitle: string, headers: string[], rows: (string | number)[][]): void {
  const xmlEscape = (v: string | number) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const headerCells = headers
    .map((h) => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${xmlEscape(h)}</Data></Cell>`)
    .join('');

  const dataRows = rows
    .map(
      (r) =>
        `<Row>${r
          .map((cell) => {
            const isNum = typeof cell === 'number' && Number.isFinite(cell);
            return `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${xmlEscape(cell)}</Data></Cell>`;
          })
          .join('')}</Row>`
    )
    .join('');

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="hdr"><Font ss:Bold="1"/><Interior ss:Color="#F3F1EC" ss:Pattern="Solid"/></Style>
 </Styles>
 <Worksheet ss:Name="${xmlEscape(sheetTitle.slice(0, 31))}">
  <Table>
   <Row>${headerCells}</Row>
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>`;

  triggerDownload(
    filename.endsWith('.xls') ? filename : `${filename}.xls`,
    xml,
    'application/vnd.ms-excel;charset=utf-8;'
  );
}

export function exportReportPdfPrint(title: string, headers: string[], rows: (string | number)[][]): void {
  // Renders a clean printable frame without popup blockers using an offscreen iframe
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  const ths = headers.map((h) => `<th style="text-align:left;padding:8px;border-bottom:2px solid #1c1917;font-size:12px;">${h}</th>`).join('');
  const trs = rows
    .map(
      (r) =>
        `<tr>${r
          .map((c) => `<td style="padding:7px 8px;border-bottom:1px solid #e7e5e4;font-size:12px;font-variant-numeric:tabular-nums;">${c}</td>`)
          .join('')}</tr>`
    )
    .join('');

  doc.open();
  doc.write(`
    <!doctype html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: system-ui, sans-serif; color: #1c1917; margin: 28px; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          p { font-size: 12px; color: #78716c; margin-top: 0; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; }
        </style>
      </head>
      <body>
        <h1>UNAI POS — ${title}</h1>
        <p>Generated on ${new Date().toLocaleString()}</p>
        <table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
      </body>
    </html>
  `);
  doc.close();
  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
  setTimeout(() => document.body.removeChild(iframe), 1500);
}

export function downloadJson(filename: string, data: unknown): void {
  triggerDownload(
    filename.endsWith('.json') ? filename : `${filename}.json`,
    JSON.stringify(data, null, 2),
    'application/json;charset=utf-8;'
  );
}

function triggerDownload(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
