'use client';

import { useEffect, useState } from 'react';

function sortAttendanceAsc(records) {
  return [...records].sort((a, b) => new Date(a.AttDate) - new Date(b.AttDate));
}

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const monthShortNames = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// dd/mm/yyyy — matches the register's date format regardless of browser locale.
function formatRegisterDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// Note: attendance-type color coding was removed — the exported table
// now uses a plain white background for every cell.

export default function MyAttendancePage({ empcode }) {
  const [attendance, setAttendance] = useState([]);
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!empcode) return;

    async function loadAttendance() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/employee?empcode=${encodeURIComponent(empcode)}&month=${month}&year=${year}`
        );
        const data = await res.json();
        if (res.ok && data.attendance) {
          setAttendance(sortAttendanceAsc(data.attendance));
          setEmployee(data.employee || null);
        } else {
          setAttendance([]);
          setEmployee(null);
        }
      } catch (err) {
        console.error('Failed to load attendance:', err);
        setAttendance([]);
        setEmployee(null);
      } finally {
        setLoading(false);
      }
    }

    loadAttendance();
  }, [empcode, month, year]);

  // Builds a clean, single-page "Monthly Attendance Report" PDF using jsPDF + autoTable:
  //   Title: centered
  //   Header: Employee ID | Employee Name  /  Department | Month  (boxed, thick black border)
  //   Table: Date | InTime | OutTime | Attendance Type | Remarks (full remaining width)
  //     — sorted ascending by date (1st of the month first)
  //     — dotted grid lines (real dashes, not solid), printer-safe
  //     — Date column rendered bold + pure black so it stays crisp when printed/scanned
  //     — row heights are planned to fill the space above a reserved
  //       "2 rows tall" footer buffer, then self-corrected: if jsPDF's real
  //       text metrics push the table past one page, we shrink the row
  //       height and re-render until everything fits on a single A4 page.
  //   Sign-off line: "Prepared: / Checked: / Approved:" between the table and footer.
  //   Footer: "Greentech Industries HR", 10pt from the bottom edge.
  async function handleDownloadPdf() {
    if (!attendance.length) return;

    setExporting(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;

      // Portrait A4.
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 30;
      const pageCenterX = pageWidth / 2;
      const BLACK = [0, 0, 0];

      const idLabel = employee?.Empcode || empcode || '';
      const nameLabel = employee?.EmpName || '';
      const deptLabel = employee?.DeptCode || '';
      const monthLabel = `${monthNames[month - 1]} ${year}`;
      const downloadDateLabel = formatRegisterDate(new Date());

      // ---- Title (centered) ----
      doc.setFontSize(15);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(20, 20, 20);
      doc.text('Daily Attendance Register', pageCenterX, 32, { align: 'center' });

      // ---- Download date (top-right corner of the header) ----
      doc.setFontSize(8.5);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(20, 20, 20);
      doc.text(`Date : ${downloadDateLabel}`, pageWidth - marginX, 32, { align: 'right' });

      // ---- Header: 2x2 label/value grid, boxed with a thick black border ----
      const headerBoxTop = 44;
      const headerBoxHeight = 56;
      const headerBoxBottom = headerBoxTop + headerBoxHeight;

      doc.setDrawColor(...BLACK);
      doc.setLineWidth(1.4);
      doc.setLineCap('square');
      doc.setLineJoin('miter');
      doc.rect(marginX, headerBoxTop, pageWidth - marginX * 2, headerBoxHeight);
      // Horizontal divider between the two header rows
      doc.line(marginX, headerBoxTop + headerBoxHeight / 2, pageWidth - marginX, headerBoxTop + headerBoxHeight / 2);
      // Vertical divider between the two header columns
      doc.line(pageCenterX, headerBoxTop, pageCenterX, headerBoxBottom);

      const labelColor = [0, 0, 0];
      const valueColor = [0, 0, 0];

      const col1X = marginX + 10;
      const col2X = pageCenterX + 10;
      let rowY = headerBoxTop + 20;
      const rowGap = headerBoxHeight / 2;

      doc.setFontSize(8.5);

      // Row 1: Employee ID | Employee Name
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...labelColor);
      doc.text('Employee ID :', col1X, rowY);
      doc.text('Employee Name :', col2X, rowY);

      doc.setFont(undefined, 'normal');
      doc.setTextColor(...valueColor);
      doc.text(String(idLabel), col1X + 65, rowY);
      doc.text(String(nameLabel), col2X + 80, rowY);

      // Row 2: Department | Month
      rowY += rowGap;
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...labelColor);
      doc.text('Department :', col1X, rowY);
      doc.text('Month :', col2X, rowY);

      doc.setFont(undefined, 'normal');
      doc.setTextColor(...valueColor);
      doc.text(String(deptLabel), col1X + 65, rowY);
      doc.text(monthLabel, col2X + 80, rowY);

      // No gap here — the table's top border sits flush against the
      // header box's bottom border so the two visually merge into one line.
      const tableStartY = headerBoxBottom;

      // ---- Footer text setup ----
      // Footer text sits 10pt above the page's bottom edge.
      const footerPrintedDate = formatRegisterDate(new Date());
      const footerText = `Greentech Industries HR@  ${footerPrintedDate} By Jagadeesh`;
      const footerFontSize = 8;
      const footerBaselineY = pageHeight - 10; // 10pt from the very bottom

      // ---- Table setup ----
      // PDF report reads top-to-bottom as a register, so sort ascending
      // (1st of the month first) regardless of the on-screen sort order.
      const sortedForPdf = [...attendance].sort(
        (a, b) => new Date(a.AttDate) - new Date(b.AttDate)
      );

      const rows = sortedForPdf.map((record) => [
        formatRegisterDate(record.AttDate),
        record.InTime || '',
        record.OutTime || '',
        record.AttType || '',
        record.Remarks || '',
      ]);

      const usableWidth = pageWidth - marginX * 2; // portrait A4: 595 - 60 = 535pt

      // Exact pt widths summing to usableWidth — guarantees no horizontal overflow.
      const colWidths = {
        date: 62,
        inTime: 55,
        outTime: 55,
        attType: 85,
      };
      const fixedSum = colWidths.date + colWidths.inTime + colWidths.outTime + colWidths.attType;
      const remarksWidth = usableWidth - fixedSum;

      // ---- Dynamic row height, with a self-correcting single-page guarantee ----
      // The row height is planned to exactly fill the page, but jsPDF's real
      // text metrics (bold fonts, actual glyph widths) can run a hair taller
      // than the plan — enough to spill the last row onto a near-empty page 2.
      // Rather than trust the one-shot estimate, render, check the actual
      // page count, and shrink + re-render if it didn't fit on one page.
      //
      // The footer buffer reserves 3 row-heights worth of space below the
      // table: one for the "Prepared / Checked / Approved" sign-off line,
      // plus breathing room above/below it before the footer text.
      const totalRowCount = rows.length + 1; // +1 for the header row
      const nominalBufferRows = 3;
      const MIN_ROW_HEIGHT = 8;

      function availableHeightFor(rh) {
        const footerReserved = footerFontSize + 10 + nominalBufferRows * rh;
        const avail = pageHeight - footerReserved - tableStartY;
        return Math.max(MIN_ROW_HEIGHT, Math.min(avail / totalRowCount, 26));
      }

      // First pass: estimate assuming a nominal 18pt/row buffer.
      let rowHeight = availableHeightFor(18);
      // Second pass: refine using the row height from pass one.
      rowHeight = availableHeightFor(rowHeight);

      // Dotted grid line settings — real short dashes (not near-zero dots),
      // drawn with a butt cap so each mark reads clearly as "-" rather than
      // blurring into its neighbors.
      const GRID_DASH = [2.5, 1.8];
      const GRID_LINE_WIDTH = 0.5;
      const OUTER_BORDER_WIDTH = 1.4; // solid, thick — matches header box
      const OUTER_BORDER_WIDTH_INNER = 1.3; // thick solid rule under the column-name row

      let footerReservedHeight;
      let fitsOnePage = false;

      for (let attempt = 0; attempt < 8 && !fitsOnePage; attempt++) {
        // Discard any pages left over from a previous attempt.
        while (doc.internal.getNumberOfPages() > 1) {
          doc.deletePage(doc.internal.getNumberOfPages());
        }
        doc.setPage(1);

        const bodyFontSize = Math.max(5, Math.min(9, rowHeight * 0.32));
        const cellPaddingY = Math.max(1, Math.min(6, (rowHeight - bodyFontSize) / 2.5));
        footerReservedHeight = footerFontSize + 10 + nominalBufferRows * rowHeight;

        autoTable(doc, {
          startY: tableStartY,
          head: [['Date', 'In Time', 'Out Time', 'Attendance Type', 'Remarks']],
          body: rows,
          // 'plain' = no lines drawn by autoTable itself; we draw a dotted
          // grid ourselves in didDrawCell so every border is dashed, not solid.
          theme: 'plain',
          tableWidth: usableWidth,
          styles: {
            fontSize: bodyFontSize,
            cellPadding: cellPaddingY,
            minCellHeight: rowHeight,
            overflow: 'linebreak',
            valign: 'middle',
            textColor: [10, 10, 10],
          },
          headStyles: {
            fillColor: [255, 255, 255],
            textColor: [10, 10, 10],
            fontStyle: 'bold',
            halign: 'center',
            fontSize: Math.min(bodyFontSize + 0.5, 9),
            minCellHeight: rowHeight,
          },
          bodyStyles: {
            halign: 'center',
            fillColor: [255, 255, 255],
          },
          columnStyles: {
            0: { cellWidth: colWidths.date, fontStyle: 'bold' },
            1: { cellWidth: colWidths.inTime },
            2: { cellWidth: colWidths.outTime },
            3: { cellWidth: colWidths.attType },
            4: { cellWidth: remarksWidth },
          },
          didParseCell: (data) => {
            // Date column: force bold + pure black so it stays crisp and
            // clearly visible when printed or scanned/photocopied.
            if (data.section === 'body' && data.column.index === 0) {
              data.cell.styles.textColor = [0, 0, 0];
              data.cell.styles.fontStyle = 'bold';
            }
            if (data.section === 'body' && data.column.index === 3) {
              data.cell.styles.fillColor = [255, 255, 255]; // was color-coded by attendance type — now plain white
              data.cell.styles.fontStyle = 'bold';
            }
          },
          didDrawCell: (data) => {
            // Draw a dotted (dashed) border around every cell (head + body),
            // replacing autoTable's default solid grid entirely.
            // NOTE: doc.rect() does not reliably honor setLineDashPattern()
            // in jsPDF — dashing only applies consistently to doc.line(),
            // so each side of the cell is drawn individually.
            const { x, y, width: w, height: h } = data.cell;
            doc.setDrawColor(...BLACK);
            doc.setLineCap('butt'); // square/round caps stretch each dash and blur them together

            // Header row (Date / In Time / Out Time / Attendance Type /
            // Reason for Leave / Remarks): all 4 sides thick + solid.
            // Every other row: dashed grid as before.
            const isHeadRow = data.section === 'head';

            if (isHeadRow) {
              // Top + bottom: thick, solid, black — frames the header row.
              doc.setDrawColor(...BLACK);
              doc.setLineDashPattern([], 0);
              doc.setLineWidth(OUTER_BORDER_WIDTH_INNER);
              doc.line(x, y, x + w, y);         // top
              doc.line(x, y + h, x + w, y + h); // bottom

              // Left + right: gray, a bit thicker than before — still
              // subordinate to the thick black frame, but more visible.
              doc.setDrawColor(150, 150, 150);
              doc.setLineWidth(0.9);
              doc.line(x, y, x, y + h);         // left
              doc.line(x + w, y, x + w, y + h); // right
            } else {
              const isFirstBodyRow = data.section === 'body' && data.row.index === 0;
              doc.setLineWidth(GRID_LINE_WIDTH);
              doc.setLineDashPattern(GRID_DASH, 0);
              if (!isFirstBodyRow) {
                doc.line(x, y, x + w, y);       // top — skipped for row 0, header's thick bottom already owns this line
              }
              doc.line(x, y + h, x + w, y + h); // bottom
              doc.line(x, y, x, y + h);         // left
              doc.line(x + w, y, x + w, y + h); // right
            }

            doc.setLineDashPattern([], 0); // reset to solid for anything drawn after the table
            doc.setLineWidth(GRID_LINE_WIDTH);
            doc.setLineCap('square');       // restore for the solid outer border drawn afterward
          },
          margin: { left: marginX, right: marginX, bottom: footerReservedHeight },
          pageBreak: 'avoid', // keep everything on one page rather than letting autoTable start a 2nd page
        });

        fitsOnePage = doc.internal.getNumberOfPages() === 1;
        if (!fitsOnePage) {
          rowHeight = Math.max(MIN_ROW_HEIGHT, rowHeight * 0.92); // shrink ~8% and retry
        }
      }

      // ---- Page count ("Page 1 of 1") — bottom-right of the footer ----
      // Uses the real final page count from the fit loop above, not an
      // assumption made before the table was drawn.
      const totalPages = doc.internal.getNumberOfPages();
      doc.setPage(1);

      // ---- Solid thick outer border around the whole table ----
      // The inner grid is dotted, but the table's outer edge stays a bold
      // solid rectangle (same weight as the header box) for a clean frame.
      const tableFinalY = doc.lastAutoTable.finalY;
      doc.setLineDashPattern([], 0);
      doc.setDrawColor(...BLACK);
      doc.setLineWidth(OUTER_BORDER_WIDTH);
      doc.rect(marginX, tableStartY, usableWidth, tableFinalY - tableStartY, 'S');

      // ---- Sign-off line: Prepared / Checked / Approved ----
      // Sits in the reserved buffer band between the table's bottom border
      // and the footer text, vertically centered in that gap. Three equal
      // columns across the table width, label left-aligned in each column,
      // leaving blank space after every label (including Approved, which
      // now has room before the page edge) to physically sign.
      const signOffY = (tableFinalY + footerBaselineY) / 2 + 2;
      const signColWidth = usableWidth / 3;
      const signCols = [
        { label: 'Prepared:', x: marginX },
        { label: 'Checked:', x: marginX + signColWidth },
        { label: 'Approved:', x: marginX + signColWidth * 2 },
      ];

      doc.setLineDashPattern([], 0);
      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(0, 0, 0);

      signCols.forEach((col) => {
        doc.text(col.label, col.x, signOffY);
      });

      // ---- Footer: "GREENTECH INDUSTRIES HR", 10pt from bottom ----
      doc.setFontSize(footerFontSize);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(20, 20, 20);
      doc.text(footerText, pageCenterX, footerBaselineY, { align: 'center' });

      // "Page 1 of 1" — bottom-right corner, same baseline as the footer text above.
      doc.setTextColor(20, 20, 20);
      doc.text(`Page 1 of ${totalPages}`, pageWidth - marginX, footerBaselineY, { align: 'right' });

      const empLabel = (employee?.EmpName || empcode || 'employee')
        .toString()
        .replace(/[^a-z0-9]+/gi, '_');
      const fileName = `Attendance_${empLabel}_${monthNames[month - 1]}_${year}.pdf`;

      doc.save(fileName);
    } catch (err) {
      console.error('Failed to export attendance to PDF:', err);
    } finally {
      setExporting(false);
    }
  }

  async function handleDownloadExcel() {
    if (!attendance.length) return;

    setExporting(true);
    try {
      const ExcelJSModule = await import('exceljs');
      const ExcelJS = ExcelJSModule.default || ExcelJSModule;
      const sortedForExcel = [...attendance].sort(
        (a, b) => new Date(a.AttDate) - new Date(b.AttDate)
      );
      const idLabel = employee?.Empcode || empcode || '';
      const nameLabel = employee?.EmpName || '';
      const deptLabel = employee?.DeptCode || '';
      const monthLabel = `${monthNames[month - 1]} ${year}`;
      const downloadDateLabel = formatRegisterDate(new Date());
      const footerText = 'Greentech Industries HR@  01/10/2026 By Jagadeesh';
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Attendance', {
        pageSetup: {
          orientation: 'portrait',
          paperSize: 9,
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 1,
          horizontalDpi: 300,
          verticalDpi: 300,
        },
        views: [{ showGridLines: false }],
      });

      worksheet.columns = [
        { width: 2 },
        { width: 6.5 }, { width: 6.5 },
        { width: 6 }, { width: 6 },
        { width: 6 }, { width: 6 },
        { width: 8 }, { width: 8 },
        { width: 18 }, { width: 18 },
      ];

      const blackBorder = { style: 'thin', color: { argb: 'FF000000' } };
      const lightBorder = { style: 'thin', color: { argb: 'FF808080' } };
      const dottedBorder = { style: 'dotted', color: { argb: 'FFB7B7B7' } };
      const tableBorder = { top: blackBorder, bottom: blackBorder, left: blackBorder, right: blackBorder };
      const bodyBorder = { top: dottedBorder, bottom: dottedBorder, left: dottedBorder, right: dottedBorder };
      const center = { horizontal: 'center', vertical: 'middle' };
      const whiteFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      const labelFont = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
      const normalFont = { name: 'Calibri', size: 11, color: { argb: 'FF000000' } };
      const pageInfoFont = { ...normalFont, size: 9 };

      worksheet.mergeCells('B1:J1');
      worksheet.getCell('B1').value = 'Daily Attendance Register';
      worksheet.getCell('B1').font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF000000' } };
      worksheet.getCell('B1').alignment = { horizontal: 'left', vertical: 'bottom' };
      worksheet.getCell('K1').value = `Page 1 of 1\nDate : ${downloadDateLabel}\nPrepared By:${'\u00A0'.repeat(20)}`;
      worksheet.getCell('K1').font = pageInfoFont;
      worksheet.getCell('K1').alignment = { horizontal: 'right', vertical: 'bottom', wrapText: true };
      worksheet.mergeCells('E3:F3');
      worksheet.mergeCells('J3:K3');
      worksheet.getCell('E3').value = 'Approved:';
      worksheet.getCell('E3').font = labelFont;
      worksheet.getCell('E3').alignment = center;
      worksheet.getCell('J3').value = 'Checked:';
      worksheet.getCell('J3').font = labelFont;
      worksheet.getCell('J3').alignment ={ horizontal: 'left', vertical: 'middle' };

      worksheet.getRow(1).height = 42;
      worksheet.getRow(2).height = 8;
      worksheet.getRow(3).height = 26;
      worksheet.getRow(4).getCell(2).value = `Employee ID :    ${idLabel}`;
      worksheet.getRow(4).getCell(8).value = `Employee Name :    ${nameLabel}`;
      worksheet.mergeCells('B4:G4');
      worksheet.mergeCells('H4:K4');
      worksheet.getRow(5).getCell(2).value = `Department :    ${deptLabel}`;
      worksheet.getRow(5).getCell(8).value = `Month :${monthLabel}`;
      worksheet.mergeCells('B5:G5');
      worksheet.mergeCells('H5:K5');
      [4, 5].forEach((rowNumber) => {
        const row = worksheet.getRow(rowNumber);
        row.height = 22;
        for (let column = 2; column <= 11; column += 1) {
          const cell = row.getCell(column);
          cell.fill = whiteFill;
          cell.border = {
            top: blackBorder,
            bottom: blackBorder,
            ...(column === 2 || column === 8 ? { left: blackBorder } : {}),
            ...(column === 7 || column === 11 ? { right: blackBorder } : {}),
          };
          cell.font = normalFont;
          cell.alignment = { vertical: 'middle', horizontal: column === 2 || column === 8 ? 'left' : 'center' };
        }
      });
      ['B4', 'H4'].forEach((address) => {
        worksheet.getCell(address).font = labelFont;
        worksheet.getCell(address).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      });
      ['B5', 'H5'].forEach((address) => {
        worksheet.getCell(address).font = labelFont;
        worksheet.getCell(address).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      });

      // Keep the employee details and column headings in one continuous table.
      const headerRow = worksheet.getRow(6);
      headerRow.height = 20;
      [['B6:C6', 'Date'], ['D6:E6', 'In Time'], ['F6:G6', 'Out Time'], ['H6:I6', 'Attendance Type'], ['J6:K6', 'Remarks']].forEach(([range, value]) => {
        worksheet.mergeCells(range);
        const cell = worksheet.getCell(range.split(':')[0]);
        cell.value = value;
        cell.font = labelFont;
        cell.alignment = center;
        cell.fill = whiteFill;
        cell.border = {
          bottom: lightBorder,
          left: blackBorder,
          right: blackBorder,
        };
      });

      sortedForExcel.forEach((record, index) => {
        const row = worksheet.getRow(7 + index);
        worksheet.mergeCells(`B${row.number}:C${row.number}`);
        worksheet.mergeCells(`D${row.number}:E${row.number}`);
        worksheet.mergeCells(`F${row.number}:G${row.number}`);
        worksheet.mergeCells(`H${row.number}:I${row.number}`);
        worksheet.mergeCells(`J${row.number}:K${row.number}`);
        row.getCell(2).value = formatRegisterDate(record.AttDate);
        row.getCell(4).value = record.InTime || '';
        row.getCell(6).value = record.OutTime || '';
        row.getCell(8).value = record.AttType || '';
        row.getCell(10).value = record.Remarks || '';
        row.height = 21;
        row.eachCell((cell, column) => {
          cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF000000' }, bold: column === 2 || column === 8 };
          cell.alignment = { ...center, wrapText: column === 10 };
          cell.fill = whiteFill;
          cell.border = bodyBorder;
        });
      });

      const lastAttendanceRow = 7 + sortedForExcel.length - 1;

      // Solid outer frame around the details, headings, and attendance rows.
      for (let rowNumber = 4; rowNumber <= lastAttendanceRow; rowNumber += 1) {
        worksheet.getCell(`B${rowNumber}`).border = {
          ...worksheet.getCell(`B${rowNumber}`).border,
          left: blackBorder,
        };
        worksheet.getCell(`K${rowNumber}`).border = {
          ...worksheet.getCell(`K${rowNumber}`).border,
          right: blackBorder,
        };
      }
      for (let column = 2; column <= 11; column += 1) {
        worksheet.getCell(4, column).border = {
          ...worksheet.getCell(4, column).border,
          top: blackBorder,
        };
        worksheet.getCell(lastAttendanceRow, column).border = {
          ...worksheet.getCell(lastAttendanceRow, column).border,
          bottom: blackBorder,
        };
      }

      worksheet.pageSetup.fitToPage = true;
      worksheet.pageSetup.fitToWidth = 1;
      worksheet.pageSetup.fitToHeight = 1;
      worksheet.pageSetup.horizontalCentered = true;
      worksheet.pageSetup.margins = { left: 0.2, right: 0.2, top: 0.25, bottom: 0.35, header: 0, footer: 0.25 };
      worksheet.headerFooter.oddFooter = `&C${footerText}`;
      worksheet.printArea = `B1:K${lastAttendanceRow}`;

      const empLabel = (employee?.EmpName || empcode || 'employee')
        .toString()
        .replace(/[^a-z0-9]+/gi, '_');
      const fileName = `Attendance_${empLabel}_${monthNames[month - 1]}_${year}.xlsx`;
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Failed to export attendance to Excel:', err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="dashboardPage">
      <div className="dashboardBlob dashboardBlobOne" />
      <div className="dashboardBlob dashboardBlobTwo" />

      <div className="dashboardAttendance">
        <div className="hodFilterBar">
          <div className="hodFilterField">
            <label>Month:</label>
            <select
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value, 10))}
            >
              {monthNames.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="hodFilterField">
            <label>Year:</label>
            <input
              type="number"
              className="yearInput"
              value={year}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setYear(Number.isNaN(val) ? new Date().getFullYear() : val);
              }}
              min="2000"
              max="2100"
            />
          </div>

          <div className="attendanceExportActions">
            <button
              type="button"
              className="downloadExcelButton"
              onClick={handleDownloadExcel}
              disabled={exporting || loading || attendance.length === 0}
            >
              {exporting ? 'Exporting...' : '📊 Download Excel'}
            </button>
          </div>
        </div>

        <div className="hodSelectedInfo">
          <div>
            <strong>Employee:</strong>
            <span className="hodHighlightValue">
              {employee?.EmpName || empcode}
            </span>
          </div>
          <div>
            <strong>Department:</strong>
            <span className="hodHighlightValue">
              {employee?.DeptCode || '-'}
            </span>
          </div>
        </div>

        {loading ? (
          <p>Loading attendance data...</p>
        ) : attendance.length === 0 ? (
          <p>No attendance records found for the selected month.</p>
        ) : (
          <div className="hodTableWrapper attendanceDetailTableWrapper">
            <div className="scrollableTableWrapper attendanceDetailWrapper">
              <table className="attendanceTable attendanceDetailTable">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>In Time</th>
                    <th>Out Time</th>
                    <th>Attendance Type</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((record, idx) => {
                    const rowKey = `${record.Empcode || empcode}-${record.AttDate ? new Date(record.AttDate).toISOString() : idx}`;
                    return (
                      <tr key={rowKey}>
                        <td>{formatRegisterDate(record.AttDate) || '-'}</td>
                        <td>{record.InTime || '-'}</td>
                        <td>{record.OutTime || '-'}</td>
                        <td>{record.AttType || '-'}</td>
                        <td>{record.Remarks || ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}