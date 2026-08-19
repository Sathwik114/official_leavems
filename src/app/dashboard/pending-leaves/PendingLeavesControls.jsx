'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const now = new Date();
const DEFAULT_YEAR = String(now.getFullYear());
const DEFAULT_MONTH = String(now.getMonth() + 1);

// Receives the currently-filtered leave rows (as loaded by the server page)
// so it can export exactly what's on screen.
export default function PendingLeavesControls({ leaves = [] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [year, setYear] = useState(searchParams.get('year') || DEFAULT_YEAR);
  const [month, setMonth] = useState(searchParams.get('month') || DEFAULT_MONTH);
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [exporting, setExporting] = useState(false);
  const debounceRef = useRef(null);

  function updateUrl(nextYear, nextMonth, nextStatus) {
    const params = new URLSearchParams();
    if (nextYear) params.set('year', nextYear);
    // 'month' is always written explicitly (including 'all') so the URL
    // distinguishes "no selection yet" from "user chose All Months".
    params.set('month', nextMonth || 'all');
    if (nextStatus) params.set('status', nextStatus);
    router.push(`?${params.toString()}`);
  }

  // Year is free-typed, so debounce it — update the URL a moment after
  // the person stops typing rather than on every keystroke.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateUrl(year, month, status);
    }, 500);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  // Month is a dropdown, so update immediately on selection.
  function handleMonthChange(e) {
    const value = e.target.value; // '' when "All Months" is chosen
    setMonth(value);
    updateUrl(year, value, status);
  }

  // Pending status is a dropdown too, update immediately.
  function handleStatusChange(e) {
    const value = e.target.value;
    setStatus(value);
    updateUrl(year, month, value);
  }

  function handleClear() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setYear(DEFAULT_YEAR);
    setMonth(DEFAULT_MONTH);
    setStatus('');
    updateUrl(DEFAULT_YEAR, DEFAULT_MONTH, '');
  }

  async function handleDownloadExcel() {
    if (!leaves.length) return;

    setExporting(true);
    try {
      const XLSX = await import('xlsx');

      const rows = leaves.map((leave) => ({
        'Applicant ID': leave.ApplicantId || '-',
        'Applicant Name': leave.ApplicantName || '-',
        'Leave Type': leave.LeaveType || '-',
        'Start Date': leave.StartDate
          ? new Date(leave.StartDate).toLocaleDateString('en-GB')
          : '-',
        'End Date': leave.EndDate
          ? new Date(leave.EndDate).toLocaleDateString('en-GB')
          : '-',
        'Total Days': leave.TotalDays ?? '-',
        Reason: leave.Reason || '-',
        'Vice President Status': leave.HodStatus || '-',
        'President Status': leave.CccStatus?.trim() || '-',
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 12 },
        { wch: 12 }, { wch: 10 }, { wch: 30 }, { wch: 16 }, { wch: 16 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Pending Leaves');

      const monthLabel = month ? MONTH_NAMES[parseInt(month, 10) - 1] : 'AllMonths';
      const yearLabel = year || 'AllYears';
      const statusLabel = status ? `_${status}` : '';
      const fileName = `Pending_Leaves_${yearLabel}_${monthLabel}${statusLabel}.xlsx`;

      XLSX.writeFile(workbook, fileName);
    } catch (err) {
      console.error('Failed to export pending leaves to Excel:', err);
    } finally {
      setExporting(false);
    }
  }

  const isFiltered = year !== DEFAULT_YEAR || month !== DEFAULT_MONTH || status;

  return (
    <div className="pendingLeavesFilterBar">
      <div className="pendingLeavesFilterField">
        <label htmlFor="year">Year</label>
        <input
          type="number"
          id="year"
          placeholder="e.g. 2026"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        />
      </div>

      <div className="pendingLeavesFilterField">
        <label htmlFor="month">Month</label>
        <select id="month" value={month} onChange={handleMonthChange}>
          <option value="">All Months</option>
          {MONTH_NAMES.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>
      </div>

      <div className="pendingLeavesFilterField">
        <label htmlFor="status">Pending Status</label>
        <select id="status" value={status} onChange={handleStatusChange}>
          <option value="">All</option>
          <option value="VP">Vice President Status</option>
          <option value="PRESIDENT">President Status</option>
        </select>
      </div>

      {isFiltered && (
        <button
          type="button"
          className="pendingLeavesClearButton"
          onClick={handleClear}
        >
          Clear
        </button>
      )}

      <button
        type="button"
        className="pendingLeavesDownloadButton"
        onClick={handleDownloadExcel}
        disabled={exporting || leaves.length === 0}
      >
        {exporting ? 'Exporting…' : '⬇️ Download Excel'}
      </button>
    </div>
  );
}