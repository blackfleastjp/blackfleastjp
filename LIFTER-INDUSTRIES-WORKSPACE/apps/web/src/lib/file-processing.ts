export interface ImportPreview {
  headers: string[];
  rows: Array<Record<string, string>>;
  totalRows: number;
}

export async function previewSpreadsheet(file: File): Promise<ImportPreview> {
  const XLSX = await import("xlsx");
  if (file.size > 10 * 1024 * 1024) throw new Error("Choose a file smaller than 10 MB.");
  if (!/\.(csv|xlsx|xls)$/i.test(file.name)) throw new Error("Choose a CSV or Excel workbook.");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!firstSheet) throw new Error("The workbook does not contain a sheet.");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  const headers = (matrix[0] ?? []).map((cell) => String(cell).trim());
  if (
    !headers.length ||
    headers.some((header) => !header) ||
    new Set(headers).size !== headers.length
  ) {
    throw new Error("The first row must contain unique, non-empty column names.");
  }
  if (matrix.length > 1001) throw new Error("The import preview is limited to 1,000 rows.");
  const rows = matrix
    .slice(1)
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? "").trim()])),
    );
  return { headers, rows, totalRows: rows.length };
}

export async function exportTablePdf(
  title: string,
  headers: string[],
  rows: string[][],
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const document = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const margin = 42;
  const rowHeight = 26;
  const columnWidth = (pageWidth - margin * 2) / headers.length;
  let y = margin;
  document.setFont("helvetica", "bold");
  document.setFontSize(18);
  document.text(title, margin, y);
  y += 34;
  const drawHeader = () => {
    document.setFillColor(30, 54, 46);
    document.rect(margin, y, pageWidth - margin * 2, rowHeight, "F");
    document.setTextColor(255, 255, 255);
    document.setFontSize(9);
    headers.forEach((header, index) =>
      document.text(header, margin + index * columnWidth + 8, y + 17, {
        maxWidth: columnWidth - 12,
      }),
    );
    y += rowHeight;
    document.setTextColor(35, 43, 40);
    document.setFont("helvetica", "normal");
  };
  drawHeader();
  for (const row of rows) {
    if (y + rowHeight > pageHeight - margin) {
      document.addPage();
      y = margin;
      drawHeader();
    }
    row.forEach((value, index) =>
      document.text(value, margin + index * columnWidth + 8, y + 17, {
        maxWidth: columnWidth - 12,
      }),
    );
    document.setDrawColor(224, 229, 226);
    document.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
    y += rowHeight;
  }
  document.save(`${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`);
}
