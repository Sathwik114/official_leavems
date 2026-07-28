'use client';

import { useEffect, useState } from 'react';
import './monitorhod.css';

function sortAttendanceDesc(records) {
  return [...records].sort((a, b) => new Date(b.AttDate) - new Date(a.AttDate));
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
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

const THIN_BORDER = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};

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
          setAttendance(sortAttendanceDesc(data.attendance));
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

  // Builds a bordered, bold-headed "Attendance Register" .xlsx using exceljs:
  //   Row 1: Name | Department
  //   Row 2: ID   | Month
  //   Row 3: Date | InTime | OutTime | Attendance Type | Reason for leave | Remarks
  // Reason for leave / Remarks are left blank for manual filling.
  async function handleDownloadExcel() {
    if (!attendance.length) return;

    setExporting(true);
    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();

      const monthLabel = `${monthShortNames[month - 1]}-${String(year).slice(-2)}`;
      const worksheet = workbook.addWorksheet(monthLabel, {
        views: [{ state: 'frozen', ySplit: 3 }],
      });

      const nameLabel = employee?.EmpName || empcode || '-';
      const deptLabel = employee?.DeptCode || '-';
      const idLabel = employee?.Empcode || empcode || '-';

      worksheet.columns = [
        { width: 13 }, // Date
        { width: 11 }, // InTime
        { width: 11 }, // OutTime
        { width: 16 }, // Attendance Type
        { width: 20 }, // Reason for leave
        { width: 20 }, // Remarks
      ];

      // Row 1: Name | Department
      worksheet.mergeCells('A1:C1');
      worksheet.mergeCells('D1:F1');
      worksheet.getCell('A1').value = `Name : ${nameLabel}`;
      worksheet.getCell('D1').value = `Department : ${deptLabel}`;

      // Row 2: ID | Month
      worksheet.mergeCells('A2:C2');
      worksheet.mergeCells('D2:F2');
      worksheet.getCell('A2').value = `ID : ${idLabel}`;
      worksheet.getCell('D2').value = `Month: ${monthLabel}`;

      ['A1', 'D1', 'A2', 'D2'].forEach((addr) => {
        const cell = worksheet.getCell(addr);
        cell.font = { bold: true };
        cell.alignment = { vertical: 'middle' };
      });

      ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'A2', 'B2', 'C2', 'D2', 'E2', 'F2'].forEach((addr) => {
        worksheet.getCell(addr).border = THIN_BORDER;
      });

      // Row 3: column headers
      const headerRow = worksheet.getRow(3);
      headerRow.values = ['Date', 'InTime', 'OutTime', 'Attendance Type', 'Reason for leave', 'Remarks'];
      headerRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = THIN_BORDER;
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFEFEFEF' },
        };
      });

      // Data rows
      attendance.forEach((record) => {
        const row = worksheet.addRow([
          formatRegisterDate(record.AttDate),
          record.InTime || '',
          record.OutTime || '',
          record.AttType || '',
          '',
          '',
        ]);
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = THIN_BORDER;
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const empLabel = (employee?.EmpName || empcode || 'employee')
        .toString()
        .replace(/[^a-z0-9]+/gi, '_');
      const fileName = `Attendance_${empLabel}_${monthNames[month - 1]}_${year}.xlsx`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
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

          <button
            type="button"
            className="downloadExcelButton"
            onClick={handleDownloadExcel}
            disabled={exporting || loading || attendance.length === 0}
          >
            {exporting ? 'Exporting…' : '⬇️ Download Excel'}
          </button>
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
          <div className="hodTableWrapper">
            <div className="scrollableTableWrapper attendanceDetailWrapper">
              <table className="attendanceTable attendanceDetailTable">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Attendance Type</th>
                    <th>In Time</th>
                    <th>Out Time</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((record, idx) => {
                    const date = new Date(record.AttDate);
                    const rowKey = `${record.Empcode || empcode}-${record.AttDate ? new Date(record.AttDate).toISOString() : idx}`;
                    return (
                      <tr key={rowKey}>
                        <td>{date.toLocaleDateString()}</td>
                        <td>{record.AttType || '-'}</td>
                        <td>{record.InTime || '-'}</td>
                        <td>{record.OutTime || '-'}</td>
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